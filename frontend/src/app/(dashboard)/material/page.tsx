import type { Metadata } from "next";
import { MaterialDriveSection } from "@/features/material/MaterialDriveSection";

export const metadata: Metadata = {
  title: "Material de estudio",
  description:
    "Biblioteca de material compartido para estudiantes de UTN FRRO integrada desde Google Drive.",
};

export default function MaterialPage() {
  return <MaterialDriveSection />;
}
