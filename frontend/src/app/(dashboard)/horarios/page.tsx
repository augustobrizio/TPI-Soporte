import { getComisionesCursables } from "@/lib/api";
import type { MateriaCursableOut } from "@/lib/types";
import { HorariosBuilder } from "@/features/horarios/HorariosBuilder";

// El 2do cuatrimestre arranca ~20 de julio. Antes de esa fecha mostramos 1er cuatri.
function cuatrimestrePorDefecto(): 0 | 1 {
  const hoy = new Date();
  const mes = hoy.getMonth(); // 0 = enero ... 6 = julio
  const dia = hoy.getDate();
  const esSegundo = mes > 6 || (mes === 6 && dia >= 20);
  return esSegundo ? 1 : 0;
}

// Carga ambos cuatrimestres en paralelo → el switch de cuatrimestre es instantáneo (client-side)
export default async function HorariosPage() {
  const [materias1, materias2] = await Promise.all([
    getComisionesCursables(2025, 1).catch((): MateriaCursableOut[] => []),
    getComisionesCursables(2025, 2).catch((): MateriaCursableOut[] => []),
  ]);

  return (
    <HorariosBuilder
      materias1={materias1}
      materias2={materias2}
      cuatriInicial={cuatrimestrePorDefecto()}
    />
  );
}
