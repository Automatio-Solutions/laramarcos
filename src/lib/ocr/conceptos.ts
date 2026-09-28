// Conceptos de gasto e ingreso de Aplifisa para autónomos (programa fiscal).
// Fuente: "LISTADO DE CONCEPTOS" de Aplifisa (26/06/2026) facilitado por el despacho.
// En el Excel se escribe solo el CÓDIGO; el código se repite (628 = luz, agua, gas…)
// y el concepto AEAT solo sirve para que la IA elija bien.

export interface Concepto {
  codigo: string;
  aeat: string;
  descripcion: string;
}

export const CONCEPTOS_GASTO: Concepto[] = [
  { codigo: "200", aeat: "200", descripcion: "Bienes de inversión" },
  { codigo: "600", aeat: "G01", descripcion: "Compras mercaderías" },
  { codigo: "601", aeat: "G01", descripcion: "Compras materias primas" },
  { codigo: "602", aeat: "G03", descripcion: "Compras otros aprovisionamientos" },
  { codigo: "603", aeat: "G01", descripcion: "Compras REAGYP" },
  { codigo: "607", aeat: "G01", descripcion: "Trabajos otras empresas" },
  { codigo: "620", aeat: "G22", descripcion: "Gastos investigación y desarrollo" },
  { codigo: "621", aeat: "G12", descripcion: "Arrendamientos y cánones" },
  { codigo: "622", aeat: "G13", descripcion: "Reparaciones y conservación" },
  { codigo: "623", aeat: "G19", descripcion: "Servicios profesionales independientes" },
  { codigo: "623", aeat: "G40", descripcion: "Gastos de formalización de contratos" },
  { codigo: "623", aeat: "G41", descripcion: "Gastos de defensa jurídica" },
  { codigo: "623", aeat: "G42", descripcion: "Otras cantidades devengadas por terceros" },
  { codigo: "624", aeat: "G22", descripcion: "Transportes" },
  { codigo: "625", aeat: "G20", descripcion: "Primas de seguros" },
  { codigo: "626", aeat: "G22", descripcion: "Servicios bancarios" },
  { codigo: "627", aeat: "G22", descripcion: "Publicidad y propaganda" },
  { codigo: "628", aeat: "G14", descripcion: "Suministros electricidad" },
  { codigo: "628", aeat: "G15", descripcion: "Suministros agua" },
  { codigo: "628", aeat: "G16", descripcion: "Suministros gas" },
  { codigo: "628", aeat: "G17", descripcion: "Suministros telefonía e internet" },
  { codigo: "628", aeat: "G18", descripcion: "Otros suministros" },
  { codigo: "629", aeat: "G22", descripcion: "Otros servicios" },
  { codigo: "629", aeat: "G44", descripcion: "Gastos de comunidad" },
  { codigo: "631", aeat: "G26", descripcion: "Tributos no estatales" },
  { codigo: "640", aeat: "G04", descripcion: "Sueldos y salarios" },
  { codigo: "641", aeat: "G07", descripcion: "Indemnizaciones" },
  { codigo: "642", aeat: "G05", descripcion: "Seguridad social empresa" },
  { codigo: "643", aeat: "G09", descripcion: "Aportaciones plan de pensiones" },
  { codigo: "646", aeat: "G45", descripcion: "Seguridad social del titular" },
  { codigo: "646", aeat: "G46", descripcion: "Aportaciones a mutualidades del titular" },
  { codigo: "646", aeat: "G47", descripcion: "Regularización RETA (a ingresar)" },
  { codigo: "646", aeat: "G48", descripcion: "Regularización RETA (devolución)" },
  { codigo: "647", aeat: "G08", descripcion: "Dietas y viajes empleados" },
  { codigo: "648", aeat: "G11", descripcion: "Gastos de manutención" },
  { codigo: "649", aeat: "G10", descripcion: "Otros gastos sociales" },
  { codigo: "650", aeat: "G34", descripcion: "Pérdidas créditos incobrables" },
  { codigo: "661", aeat: "G24", descripcion: "Intereses obligaciones y bonos" },
  { codigo: "662", aeat: "G23", descripcion: "Intereses deudas largo plazo" },
  { codigo: "663", aeat: "G23", descripcion: "Intereses deudas corto plazo" },
  { codigo: "664", aeat: "G24", descripcion: "Intereses descuento de efectos" },
  { codigo: "666", aeat: "G24", descripcion: "Pérdidas valores negociables" },
  { codigo: "667", aeat: "G24", descripcion: "Pérdidas de créditos" },
  { codigo: "668", aeat: "G24", descripcion: "Diferencias negativas de cambio" },
  { codigo: "669", aeat: "G24", descripcion: "Otros gastos financieros" },
  { codigo: "678", aeat: "G35", descripcion: "Incentivos mecenazgo - convenios colaboración" },
  { codigo: "678", aeat: "G36", descripcion: "Incentivos mecenazgo - gastos actividades" },
  { codigo: "678", aeat: "G37", descripcion: "Otros conceptos fiscalmente deducibles" },
  { codigo: "680", aeat: "G38", descripcion: "Amortización inmovilizado inmaterial" },
  { codigo: "681", aeat: "G28", descripcion: "Amortización inmovilizado material" },
  { codigo: "681", aeat: "G29", descripcion: "Amortización de maquinaria" },
  { codigo: "681", aeat: "G30", descripcion: "Amortización elementos de transporte" },
  { codigo: "681", aeat: "G31", descripcion: "Amortización equipos informáticos" },
  { codigo: "681", aeat: "G32", descripcion: "Amortización útiles y herramientas" },
  { codigo: "681", aeat: "G33", descripcion: "Amortización ganado y cultivos" },
  { codigo: "682", aeat: "G27", descripcion: "Amortización edificios" },
];

export const CONCEPTOS_INGRESO: Concepto[] = [
  { codigo: "700", aeat: "I01", descripcion: "Ventas - ingresos" },
  { codigo: "705", aeat: "I01", descripcion: "Prestación de servicios" },
  { codigo: "710", aeat: "I08", descripcion: "Ingresos autoconsumo" },
  { codigo: "740", aeat: "I03", descripcion: "Subvenciones oficiales renta" },
  { codigo: "741", aeat: "I03", descripcion: "Otras subvenciones renta" },
  { codigo: "746", aeat: "I04", descripcion: "Subvenciones capital" },
  { codigo: "750", aeat: "I07", descripcion: "Otros ingresos" },
  { codigo: "760", aeat: "I02", descripcion: "Ingresos financieros" },
  { codigo: "770", aeat: "I09", descripcion: "Transmisión elementos patrimoniales - exceso amortización deducida" },
];

export const conceptosDe = (tipo: "gasto" | "ingreso") => (tipo === "gasto" ? CONCEPTOS_GASTO : CONCEPTOS_INGRESO);

/** Códigos distintos (lo que va en el Excel). */
export const codigosDe = (tipo: "gasto" | "ingreso") => [...new Set(conceptosDe(tipo).map((c) => c.codigo))];
