import { Modal } from "@/components/Modal";
import { TareaForm } from "@/components/TareaForm";
import { listClientes, listAsesores } from "@/lib/repos/clientes";

// Interceptor de /tareas/nuevo.
//
// El modal (.)tareas/[id] intercepta CUALQUIER navegación cliente a /tareas/<algo>,
// y con "nuevo" trataría de abrir una tarea con id="nuevo" → 404. Este segmento
// estático gana en precedencia al dinámico [id] y abre el formulario de alta en el
// mismo modal (coherente con cómo se abren las tareas). Por URL directa se muestra
// la página completa (src/app/(panel)/tareas/nuevo/page.tsx).
export default async function NuevaTareaModal() {
  const [clientes, asesores] = await Promise.all([listClientes(), listAsesores()]);
  return (
    <Modal>
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-primary">Nueva tarea</h1>
      </header>
      <TareaForm clientes={clientes} asesores={asesores} />
    </Modal>
  );
}
