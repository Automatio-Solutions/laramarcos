import Link from "next/link";

export default function Home() {
  const modulos = [
    { id: "M1", nombre: "Gestión de tareas + Clientes" },
    { id: "M2", nombre: "Presupuestación con IA" },
    { id: "M3", nombre: "Vigilancia DOE/BOE" },
    { id: "M4", nombre: "Precontabilización OCR" },
    { id: "M5", nombre: "Base de datos centralizada" },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <span className="inline-block rounded-md bg-primary-subtle px-3 py-1 text-sm font-medium text-primary">
          LaraMarcos Asesores
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-primary">
          Plataforma de gestión del despacho
        </h1>
        <p className="text-lg text-fg-muted">
          Sin papel, sin olvidos, sin ineficiencias. Cinco módulos conectados
          sobre una base de datos centralizada.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-primary px-5 py-2.5 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Entrar al panel →
        </Link>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {modulos.map((m) => (
          <li
            key={m.id}
            className="rounded-lg border border-border bg-surface-raised p-4"
          >
            <span className="text-sm font-semibold text-accent">{m.id}</span>
            <p className="font-medium text-fg">{m.nombre}</p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-fg-muted">
        Núcleo de datos (M5) operativo. Próximo: panel de Clientes.
      </p>
    </main>
  );
}
