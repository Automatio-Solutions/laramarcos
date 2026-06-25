import { Modal } from "@/components/Modal";
import { TareaDetalleView } from "@/components/TareaDetalleView";

// Ruta interceptada: al navegar a /tareas/[id] desde el tablero/lista, se abre en modal.
export default async function TareaModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Modal>
      <TareaDetalleView id={id} enModal />
    </Modal>
  );
}
