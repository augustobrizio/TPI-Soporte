"""Lógica de negocio de autenticación (RF-01, RNF-02).

Reglas:
- El email es la identidad y es único; se guarda normalizado en minúscula
  para que "Juan@…" y "juan@…" no puedan convivir como dos cuentas.
- La contraseña nunca se persiste ni se loguea en claro: solo su hash bcrypt.
- Login y registro devuelven el mismo tipo de error ante credenciales malas,
  sin distinguir "no existe" de "contraseña incorrecta".
- Una cuenta puede tener contraseña local, cuenta de Google vinculada, o las
  dos. El email sigue siendo la identidad en los tres casos.
- El ingreso con Google acepta **cualquier cuenta**. RNF-04 pedía restringirlo
  a ``@frro.utn.edu.ar``; se decidió no aplicarlo. El chequeo igual quedó
  implementado detrás de ``GOOGLE_DOMINIOS_PERMITIDOS``, vacío por default, por
  si el criterio cambia.
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.exceptions import (
    CredencialesInvalidas,
    DominioGoogleNoPermitido,
    EmailGoogleNoVerificado,
    EmailYaRegistrado,
)
from app.core.security import hash_password, verify_password
from app.db.models.usuario import Usuario
from app.repositories import usuario_repo
from app.services.google_oauth import PerfilGoogle

# Rol por defecto de una cuenta creada desde el registro público. Un alta con
# rol "admin" solo puede hacerse por fuera (seed o consola): si el rol viniera
# del request, cualquiera se registraría como admin.
ROL_POR_DEFECTO = "alumno"


def normalizar_email(email: str) -> str:
    return email.strip().lower()


def registrar(
    db: Session,
    *,
    email: str,
    password: str,
    nombre: str | None = None,
    apellido: str | None = None,
    legajo: str | None = None,
) -> Usuario:
    """Crea una cuenta nueva y devuelve el usuario.

    Lanza ``EmailYaRegistrado`` si el email ya está tomado.
    """
    email_norm = normalizar_email(email)

    if usuario_repo.get_by_email(db, email_norm) is not None:
        raise EmailYaRegistrado(email_norm)

    try:
        usuario = usuario_repo.crear(
            db,
            email=email_norm,
            password_hash=hash_password(password),
            nombre=nombre,
            apellido=apellido,
            legajo=legajo,
            rol=ROL_POR_DEFECTO,
        )
        db.commit()
    except IntegrityError:
        # Dos altas simultáneas del mismo email: el chequeo de arriba pasó en
        # ambas y la unique constraint de la DB frenó a la segunda.
        db.rollback()
        raise EmailYaRegistrado(email_norm) from None

    db.refresh(usuario)
    return usuario


def autenticar(db: Session, *, email: str, password: str) -> Usuario:
    """Valida credenciales y devuelve el usuario.

    Lanza ``CredencialesInvalidas`` tanto si el email no existe como si la
    contraseña no coincide. Cuando no existe igual se corre la verificación
    contra un hash falso (ver ``core.security.verify_password``) para que las
    dos ramas tarden lo mismo.
    """
    usuario = usuario_repo.get_by_email(db, normalizar_email(email))

    if usuario is None:
        verify_password(password, None)
        raise CredencialesInvalidas

    if not verify_password(password, usuario.password):
        raise CredencialesInvalidas

    return usuario


def _exigir_dominio_permitido(email: str) -> None:
    """Restringe el ingreso a los dominios de ``GOOGLE_DOMINIOS_PERMITIDOS``.

    **Por default la variable está vacía y no restringe nada**: se decidió
    aceptar cualquier cuenta de Google. Queda implementado por si se quiere
    activar la restricción de RNF-04 (``@frro.utn.edu.ar``).

    Cuando está activo, el chequeo va del lado del servidor y no solo con el
    hint ``hd`` de Google, porque ese parámetro filtra el selector de cuentas
    pero no impide mandar otra a mano.
    """
    dominios = get_settings().google_dominios_permitidos_list
    if not dominios:
        return

    _, _, dominio = email.rpartition("@")
    if dominio not in dominios:
        raise DominioGoogleNoPermitido(email, dominios)


def autenticar_con_google(db: Session, perfil: PerfilGoogle) -> Usuario:
    """Devuelve el usuario correspondiente a una cuenta de Google.

    Resuelve en tres pasos, en este orden:

    1. **Por ``google_sub``.** Es el identificador estable de la cuenta: si el
       usuario cambió su email en Google, esta rama lo sigue reconociendo.
    2. **Por email.** Cuenta preexistente de email + contraseña que se loguea
       por primera vez con Google: se le vincula el ``sub`` y de ahí en más
       puede entrar por cualquiera de las dos vías.
    3. **Alta nueva**, sin contraseña local (``password`` queda en NULL).

    El paso 2 es el delicado: vincular por email deja que quien controle una
    cuenta de Google tome una cuenta preexistente de UTNHub con ese email. Es
    seguro **solo** porque antes se exige ``email_verified``; sin ese chequeo
    cualquiera podría registrar un Google con el mail de otro y quedarse con
    su cuenta. Por eso la validación va acá, en el service, y no en el
    endpoint: es una regla de negocio, no de presentación.
    """
    if not perfil.email_verificado:
        raise EmailGoogleNoVerificado(perfil.email)

    email = normalizar_email(perfil.email)
    _exigir_dominio_permitido(email)

    usuario = usuario_repo.get_by_google_sub(db, perfil.sub)
    if usuario is None:
        usuario = usuario_repo.get_by_email(db, email)
        if usuario is not None:
            usuario.google_sub = perfil.sub

    if usuario is None:
        try:
            usuario = usuario_repo.crear(
                db,
                email=email,
                password_hash=None,
                nombre=perfil.nombre,
                apellido=perfil.apellido,
                rol=ROL_POR_DEFECTO,
                google_sub=perfil.sub,
                avatar_url=perfil.avatar_url,
            )
            db.commit()
        except IntegrityError:
            # Dos logins simultáneos de la misma cuenta nueva: el unique de
            # email o el de google_sub frenó al segundo. La fila ya existe, así
            # que se relee en vez de propagar el error.
            db.rollback()
            usuario = usuario_repo.get_by_google_sub(db, perfil.sub)
            if usuario is None:
                usuario = usuario_repo.get_by_email(db, email)
            if usuario is None:  # pragma: no cover - no debería pasar
                raise
        db.refresh(usuario)
        return usuario

    # Cuenta existente: se completan los datos que Google conoce y la cuenta
    # todavía no tiene. No se pisa lo que el usuario haya cargado a mano, y el
    # email no se toca aunque haya cambiado en Google: es la identidad dentro
    # de UTNHub y cambiarlo podría chocar con el unique de otra fila.
    if not usuario.nombre and perfil.nombre:
        usuario.nombre = perfil.nombre
    if not usuario.apellido and perfil.apellido:
        usuario.apellido = perfil.apellido
    # El avatar sí se refresca siempre: no hay otra fuente y la URL de Google
    # cambia cuando el usuario cambia la foto.
    if perfil.avatar_url:
        usuario.avatar_url = perfil.avatar_url

    db.commit()
    db.refresh(usuario)
    return usuario
