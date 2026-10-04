import { buildProject, entity, field, link, relationType, type NodeSpec, type RelationSpec } from './builder';
import type { Project } from '../types';

/*
 * Ejemplo complejo: «Caso Puerto Norte», una investigación periodística ficticia sobre la
 * adjudicación de la ampliación de un puerto. Todo es inventado: personas, empresas, lugares,
 * medios y cuentas. Sirve para enseñar un caso de uso duro:
 *
 *  - herencia en tres niveles (Actor → Persona → Fuente; Actor → Organización → Empresa/Institución/Medio)
 *    con tipos abstractos y preformas compartidas,
 *  - jerarquía «Dentro de» (holding → filiales, ayuntamiento → concejalías, país → ciudad → edificios)
 *    y una relación estructural alternativa («Reporta a», el organigrama),
 *  - relación genealógica con género (la familia Varela y la familia Quiroga se cruzan),
 *  - atributos de referencia dibujados como aristas («Abogado/a», «Titular», «Firmado por»),
 *  - relaciones con atributos (importe, participación, cargo), simétricas y con límite de cardinalidad,
 *  - atributos calculados, escalas, fechas, etiquetas, enlaces, notas con menciones,
 *  - vistas guardadas y consultas que responden preguntas de la investigación.
 */

const LIB = {
  nombre: 'pn_lib_nombre',
  fiabilidad: 'pn_lib_fiabilidad',
  etiquetas: 'pn_lib_etiquetas',
  notas: 'pn_lib_notas',
};

export function puertoNorteExample(): Project {
  const nodes: NodeSpec[] = [
    // ---- Lugares --------------------------------------------------------------------------
    { id: 'lira', type: 'lugar', values: { [LIB.nombre]: 'Lira', lugar_clase: 'País' } },
    {
      id: 'isola',
      type: 'lugar',
      values: { [LIB.nombre]: 'Ísola', lugar_clase: 'País' },
      notes: 'Jurisdicción con secreto bancario. Aquí está domiciliada [[Lumen Inversiones]].',
    },
    {
      id: 'puerto_norte',
      type: 'lugar',
      parent: 'lira',
      values: { [LIB.nombre]: 'Puerto Norte', lugar_clase: 'Ciudad' },
    },
    {
      id: 'ayto_edificio',
      type: 'lugar',
      parent: 'puerto_norte',
      values: { [LIB.nombre]: 'Casa Consistorial', lugar_clase: 'Edificio' },
    },
    {
      id: 'hotel',
      type: 'lugar',
      parent: 'puerto_norte',
      values: { [LIB.nombre]: 'Hotel Meridiano', lugar_clase: 'Edificio' },
    },
    {
      id: 'club',
      type: 'lugar',
      parent: 'puerto_norte',
      values: { [LIB.nombre]: 'Club Náutico de Lira', lugar_clase: 'Edificio' },
    },

    // ---- Instituciones --------------------------------------------------------------------
    {
      id: 'ayto',
      type: 'institucion',
      values: { [LIB.nombre]: 'Ayuntamiento de Puerto Norte', inst_ambito: 'Municipal', org_sede: 'ayto_edificio' },
    },
    {
      id: 'urbanismo',
      type: 'institucion',
      parent: 'ayto',
      values: { [LIB.nombre]: 'Concejalía de Urbanismo', inst_ambito: 'Municipal' },
    },
    {
      id: 'intervencion',
      type: 'institucion',
      parent: 'ayto',
      values: { [LIB.nombre]: 'Intervención municipal', inst_ambito: 'Municipal' },
    },
    {
      id: 'autoridad',
      type: 'institucion',
      values: { [LIB.nombre]: 'Autoridad Portuaria de Lira', inst_ambito: 'Estatal', org_sede: 'puerto_norte' },
    },
    {
      id: 'consejeria',
      type: 'institucion',
      values: { [LIB.nombre]: 'Consejería de Obras', inst_ambito: 'Autonómico' },
    },

    // ---- Empresas -------------------------------------------------------------------------
    {
      id: 'grupo_varela',
      type: 'empresa',
      values: {
        [LIB.nombre]: 'Grupo Varela',
        org_sector: 'Construcción',
        emp_capital: 12000000,
        emp_admin: 'ramiro',
        org_sede: 'puerto_norte',
        [LIB.etiquetas]: ['adjudicataria'],
      },
      notes:
        'Holding familiar. Controla [[Varela Construcciones]] y [[Dragados del Norte]]; la participación en [[Lumen Inversiones]] no aparece en sus cuentas.',
    },
    {
      id: 'varela_const',
      type: 'empresa',
      parent: 'grupo_varela',
      values: {
        [LIB.nombre]: 'Varela Construcciones',
        org_sector: 'Construcción',
        emp_capital: 3500000,
        emp_admin: 'elisa',
        [LIB.etiquetas]: ['adjudicataria'],
      },
    },
    {
      id: 'dragados',
      type: 'empresa',
      parent: 'grupo_varela',
      values: {
        [LIB.nombre]: 'Dragados del Norte',
        org_sector: 'Construcción',
        emp_capital: 900000,
        emp_admin: 'elisa',
      },
    },
    {
      id: 'lumen',
      type: 'empresa',
      values: {
        [LIB.nombre]: 'Lumen Inversiones',
        org_sector: 'Financiero',
        emp_capital: 3000,
        emp_admin: 'tomas',
        org_sede: 'isola',
        [LIB.etiquetas]: ['opaca'],
      },
      notes:
        'Sociedad instrumental en [[Ísola]]. Recibe pagos de [[Varela Construcciones]] y los reparte: ver la vista «Flujo de dinero».',
    },
    {
      id: 'hormigones',
      type: 'empresa',
      values: {
        [LIB.nombre]: 'Hormigones Sela',
        org_sector: 'Construcción',
        emp_capital: 600000,
        emp_admin: 'aurelio',
        org_sede: 'puerto_norte',
      },
    },
    {
      id: 'abaco',
      type: 'empresa',
      values: { [LIB.nombre]: 'Consultora Ábaco', org_sector: 'Consultoría', emp_capital: 60000, emp_admin: 'pablo' },
    },
    {
      id: 'fundacion',
      type: 'empresa',
      values: {
        [LIB.nombre]: 'Fundación Horizonte Azul',
        org_sector: 'Fundación',
        emp_capital: 30000,
        [LIB.etiquetas]: ['opaca'],
      },
      notes: 'Sin administrador conocido. Recibe donaciones de [[Lumen Inversiones]] y paga «becas».',
    },

    // ---- Medios ---------------------------------------------------------------------------
    {
      id: 'diario',
      type: 'medio',
      values: { [LIB.nombre]: 'Diario del Puerto', medio_clase: 'Prensa', org_sector: 'Comunicación' },
    },
    {
      id: 'radio',
      type: 'medio',
      values: { [LIB.nombre]: 'Radio Lira', medio_clase: 'Radio', org_sector: 'Comunicación' },
    },
    {
      id: 'brujula',
      type: 'medio',
      values: { [LIB.nombre]: 'La Brújula', medio_clase: 'Digital', org_sector: 'Comunicación' },
      notes: 'El medio que investiga. [[Lucía Bermúdez]] lleva el caso.',
    },

    // ---- Personas -------------------------------------------------------------------------
    {
      id: 'ramiro',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Ramiro Varela',
        per_genero: 'm',
        per_cargo: 'Presidente del Grupo Varela',
        per_nac: '1951-04-02',
        per_imputado: true,
        per_abogado: 'pablo',
        [LIB.etiquetas]: ['imputado'],
      },
      notes:
        'Patriarca. Cena del 20 de enero en el [[Hotel Meridiano]] con [[Marta Quiroga]] y [[Esteban Roca]] seis semanas antes de la adjudicación.',
    },
    {
      id: 'elisa',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Elisa Varela',
        per_genero: 'f',
        per_cargo: 'Consejera delegada de Varela Construcciones',
        per_nac: '1980-09-15',
        per_imputado: true,
        per_abogado: 'pablo',
        [LIB.etiquetas]: ['imputado'],
      },
    },
    {
      id: 'tomas',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Tomás Varela',
        per_genero: 'm',
        per_cargo: 'Administrador de Lumen Inversiones',
        per_nac: '1984-01-28',
        per_imputado: true,
        [LIB.etiquetas]: ['imputado'],
      },
      notes: 'Sin abogado designado todavía. Titular de la cuenta [[IS-7720 · Ísola Trust]].',
    },
    {
      id: 'marta',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Marta Quiroga',
        per_genero: 'f',
        per_cargo: 'Alcaldesa de Puerto Norte',
        per_nac: '1979-06-11',
        per_imputado: false,
        [LIB.etiquetas]: ['cargo público'],
      },
      notes:
        'Pareja de [[Tomás Varela]]. Hija de [[Aurelio Quiroga]], dueño de [[Hormigones Sela]], subcontrata de la obra.',
    },
    {
      id: 'aurelio',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Aurelio Quiroga',
        per_genero: 'm',
        per_cargo: 'Fundador de Hormigones Sela',
        per_nac: '1948-12-01',
        per_imputado: false,
      },
    },
    {
      id: 'julian',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Julián Ferrer',
        per_genero: 'm',
        per_cargo: 'Concejal de Urbanismo',
        per_nac: '1968-03-22',
        per_imputado: true,
        per_abogado: 'pablo',
        [LIB.etiquetas]: ['imputado', 'cargo público'],
      },
    },
    {
      id: 'nuria',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Nuria Ferrer',
        per_genero: 'f',
        per_cargo: 'Analista en Consultora Ábaco',
        per_nac: '1995-07-30',
        per_imputado: false,
      },
      notes: 'Hija del concejal. Firmó el informe técnico que justificó la adjudicación a la oferta más cara.',
    },
    {
      id: 'esteban',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Esteban Roca',
        per_genero: 'm',
        per_cargo: 'Presidente de la Autoridad Portuaria',
        per_nac: '1962-10-05',
        per_imputado: true,
        [LIB.etiquetas]: ['imputado', 'cargo público'],
      },
    },
    {
      id: 'ines',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Inés Roca',
        per_genero: 'f',
        per_cargo: 'Directora de la Fundación Horizonte Azul',
        per_nac: '1990-02-14',
        per_imputado: false,
      },
    },
    {
      id: 'diego',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Diego Salas',
        per_genero: 'm',
        per_cargo: 'Director del Diario del Puerto',
        per_nac: '1970-08-19',
        per_imputado: false,
      },
    },
    {
      id: 'lucia',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Lucía Bermúdez',
        per_genero: 'f',
        per_cargo: 'Periodista de La Brújula',
        per_nac: '1988-05-03',
        per_imputado: false,
        [LIB.etiquetas]: ['investigadora'],
      },
    },
    {
      id: 'pablo',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Pablo Antúnez',
        per_genero: 'm',
        per_cargo: 'Abogado',
        per_nac: '1972-11-09',
        per_imputado: false,
      },
      notes: 'Defiende a tres imputados a la vez y administra [[Consultora Ábaco]]: conflicto de interés evidente.',
    },
    {
      id: 'carmen',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Carmen Oliva',
        per_genero: 'f',
        per_cargo: 'Interventora municipal',
        per_nac: '1975-01-17',
        per_imputado: false,
        [LIB.etiquetas]: ['testigo'],
      },
      notes: 'Firmó un informe de reparo que el pleno ignoró. Testigo clave.',
    },
    {
      id: 'hector',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Héctor Lamas',
        per_genero: 'm',
        per_cargo: 'Consejero de Obras',
        per_nac: '1965-09-27',
        per_imputado: false,
        [LIB.etiquetas]: ['cargo público'],
      },
    },
    {
      id: 'rosa',
      type: 'persona',
      values: {
        [LIB.nombre]: 'Rosa Lamas',
        per_genero: 'f',
        per_cargo: 'Becaria de la Fundación Horizonte Azul',
        per_nac: '1999-04-08',
        per_imputado: false,
      },
    },

    // ---- Fuentes (subtipo de Persona) -----------------------------------------------------
    {
      id: 'gaviota',
      type: 'fuente',
      values: { [LIB.nombre]: 'Gaviota', fuente_canal: 'Mensajería cifrada', [LIB.fiabilidad]: 4, per_genero: '' },
      notes: 'Trabaja o trabajó en la [[Autoridad Portuaria de Lira]]. Aportó el borrador del contrato.',
    },
    {
      id: 'caracol',
      type: 'fuente',
      values: { [LIB.nombre]: 'Caracol', fuente_canal: 'En persona', [LIB.fiabilidad]: 2, per_genero: '' },
      notes: 'Contradice a Gaviota en las fechas. Verificar antes de publicar.',
    },

    // ---- Cuentas --------------------------------------------------------------------------
    {
      id: 'cta_lumen',
      type: 'cuenta',
      values: { cuenta_id: 'LI-0931 · Banco de Lira', cuenta_titular: 'lumen', cuenta_pais: 'lira' },
    },
    {
      id: 'cta_tomas',
      type: 'cuenta',
      values: { cuenta_id: 'IS-7720 · Ísola Trust', cuenta_titular: 'tomas', cuenta_pais: 'isola' },
    },
    {
      id: 'cta_fundacion',
      type: 'cuenta',
      values: { cuenta_id: 'LI-2210 · Caja Portuaria', cuenta_titular: 'fundacion', cuenta_pais: 'lira' },
    },
    {
      id: 'cta_marta',
      type: 'cuenta',
      values: { cuenta_id: 'LI-5581 · Caja Portuaria', cuenta_titular: 'marta', cuenta_pais: 'lira' },
    },

    // ---- Documentos -----------------------------------------------------------------------
    {
      id: 'doc_contrato',
      type: 'documento',
      values: {
        doc_titulo: 'Contrato de ampliación del muelle 4',
        doc_clase: 'Contrato',
        doc_fecha: '2024-03-12',
        doc_firmantes: ['esteban', 'elisa'],
        [LIB.fiabilidad]: 5,
        doc_resumen: 'Adjudicación a Varela Construcciones por 48 M€, un 31 % por encima de la segunda oferta.',
      },
    },
    {
      id: 'doc_acta',
      type: 'documento',
      values: {
        doc_titulo: 'Acta del pleno 14/2024',
        doc_clase: 'Acta',
        doc_fecha: '2024-03-05',
        doc_firmantes: ['marta'],
        [LIB.fiabilidad]: 5,
        doc_resumen: 'El pleno aprueba la recalificación de los terrenos anexos con el voto en contra de la oposición.',
      },
    },
    {
      id: 'doc_informe',
      type: 'documento',
      values: {
        doc_titulo: 'Informe técnico de Consultora Ábaco',
        doc_clase: 'Informe',
        doc_fecha: '2024-02-20',
        doc_firmantes: ['nuria'],
        [LIB.fiabilidad]: 3,
        doc_resumen: 'Justifica la oferta de Varela como «la única técnicamente solvente».',
      },
    },
    {
      id: 'doc_correo',
      type: 'documento',
      values: {
        doc_titulo: 'Correo «lo de siempre»',
        doc_clase: 'Correo',
        doc_fecha: '2024-01-18',
        doc_firmantes: ['julian'],
        [LIB.fiabilidad]: 2,
        doc_resumen:
          'Julián Ferrer a una dirección desconocida: «Cena el sábado, lo de siempre». Origen sin verificar.',
      },
      notes: 'Lo aportó [[Caracol]]. Sin cabeceras completas: fiabilidad baja.',
    },
    {
      id: 'doc_factura',
      type: 'documento',
      values: {
        doc_titulo: 'Factura HS-118',
        doc_clase: 'Factura',
        doc_fecha: '2024-05-30',
        doc_firmantes: ['aurelio'],
        [LIB.fiabilidad]: 4,
        doc_resumen: 'Hormigones Sela factura 1,2 M€ a Varela Construcciones por «suministros» sin albaranes.',
      },
    },
    {
      id: 'doc_extracto',
      type: 'documento',
      values: {
        doc_titulo: 'Extracto de IS-7720',
        doc_clase: 'Extracto bancario',
        doc_fecha: '2024-06-30',
        doc_firmantes: [],
        [LIB.fiabilidad]: 5,
        doc_resumen: 'Tres ingresos desde LI-0931 entre abril y junio por un total de 410 000 €.',
      },
    },
    {
      id: 'doc_reparo',
      type: 'documento',
      values: {
        doc_titulo: 'Informe de reparo de la interventora',
        doc_clase: 'Informe',
        doc_fecha: '2024-03-01',
        doc_firmantes: ['carmen'],
        [LIB.fiabilidad]: 5,
        doc_resumen:
          'Advierte de que la recalificación carece de informe de impacto y de que el expediente está incompleto.',
      },
    },

    // ---- Reuniones ------------------------------------------------------------------------
    {
      id: 'cena',
      type: 'reunion',
      values: {
        reunion_titulo: 'Cena en el Hotel Meridiano',
        reunion_fecha: '2024-01-20',
        reunion_lugar: 'hotel',
        [LIB.fiabilidad]: 3,
        reunion_tema: 'Según Gaviota, se acordó el reparto. Según Caracol, fue una cena social.',
      },
    },
    {
      id: 'reunion_urb',
      type: 'reunion',
      values: {
        reunion_titulo: 'Reunión en la Concejalía',
        reunion_fecha: '2024-02-03',
        reunion_lugar: 'ayto_edificio',
        [LIB.fiabilidad]: 4,
        reunion_tema: 'Revisión del borrador del informe técnico antes de su entrega oficial.',
      },
    },
    {
      id: 'regata',
      type: 'reunion',
      values: {
        reunion_titulo: 'Regata del Club Náutico',
        reunion_fecha: '2024-06-08',
        reunion_lugar: 'club',
        [LIB.fiabilidad]: 5,
        reunion_tema: 'Acto público. Fotografía de Tomás Varela con Esteban Roca y Diego Salas.',
      },
    },
  ];

  const relations: RelationSpec[] = [
    // Familia (genealógica)
    { type: 'familia', from: 'ramiro', to: 'elisa', kinship: 'progenitor' },
    { type: 'familia', from: 'ramiro', to: 'tomas', kinship: 'progenitor' },
    { type: 'familia', from: 'aurelio', to: 'marta', kinship: 'progenitor' },
    { type: 'familia', from: 'julian', to: 'nuria', kinship: 'progenitor' },
    { type: 'familia', from: 'esteban', to: 'ines', kinship: 'progenitor' },
    { type: 'familia', from: 'hector', to: 'rosa', kinship: 'progenitor' },
    { type: 'familia', from: 'tomas', to: 'marta', kinship: 'pareja' },

    // Control societario (con participación)
    { type: 'controla', from: 'ramiro', to: 'grupo_varela', values: { controla_pct: 58 } },
    { type: 'controla', from: 'elisa', to: 'grupo_varela', values: { controla_pct: 21 } },
    { type: 'controla', from: 'tomas', to: 'grupo_varela', values: { controla_pct: 21 } },
    { type: 'controla', from: 'grupo_varela', to: 'varela_const', values: { controla_pct: 100 } },
    { type: 'controla', from: 'grupo_varela', to: 'dragados', values: { controla_pct: 80 } },
    { type: 'controla', from: 'tomas', to: 'lumen', values: { controla_pct: 100 } },
    { type: 'controla', from: 'aurelio', to: 'hormigones', values: { controla_pct: 90 } },
    { type: 'controla', from: 'pablo', to: 'abaco', values: { controla_pct: 50 } },
    { type: 'controla', from: 'lumen', to: 'abaco', values: { controla_pct: 50 } },
    { type: 'controla', from: 'grupo_varela', to: 'diario', values: { controla_pct: 35 } },

    // Trabaja en
    {
      type: 'trabaja',
      from: 'elisa',
      to: 'varela_const',
      values: { trabaja_cargo: 'Consejera delegada', trabaja_desde: '2015-01-01' },
    },
    {
      type: 'trabaja',
      from: 'tomas',
      to: 'lumen',
      values: { trabaja_cargo: 'Administrador', trabaja_desde: '2021-06-01' },
    },
    {
      type: 'trabaja',
      from: 'julian',
      to: 'urbanismo',
      values: { trabaja_cargo: 'Concejal', trabaja_desde: '2019-06-15' },
    },
    { type: 'trabaja', from: 'nuria', to: 'abaco', values: { trabaja_cargo: 'Analista', trabaja_desde: '2023-09-01' } },
    {
      type: 'trabaja',
      from: 'carmen',
      to: 'intervencion',
      values: { trabaja_cargo: 'Interventora', trabaja_desde: '2012-03-01' },
    },
    {
      type: 'trabaja',
      from: 'ines',
      to: 'fundacion',
      values: { trabaja_cargo: 'Directora', trabaja_desde: '2022-01-10' },
    },
    {
      type: 'trabaja',
      from: 'rosa',
      to: 'fundacion',
      values: { trabaja_cargo: 'Becaria', trabaja_desde: '2024-04-01' },
    },
    {
      type: 'trabaja',
      from: 'diego',
      to: 'diario',
      values: { trabaja_cargo: 'Director', trabaja_desde: '2016-02-01' },
    },
    {
      type: 'trabaja',
      from: 'lucia',
      to: 'brujula',
      values: { trabaja_cargo: 'Redactora de investigación', trabaja_desde: '2020-09-01' },
    },
    {
      type: 'trabaja',
      from: 'aurelio',
      to: 'hormigones',
      values: { trabaja_cargo: 'Presidente', trabaja_desde: '1985-01-01' },
    },

    // Preside (una persona por institución)
    { type: 'preside', from: 'marta', to: 'ayto' },
    { type: 'preside', from: 'esteban', to: 'autoridad' },
    { type: 'preside', from: 'hector', to: 'consejeria' },

    // Reporta a (organigrama alternativo, estructural)
    { type: 'reporta', from: 'julian', to: 'marta' },
    { type: 'reporta', from: 'carmen', to: 'marta' },
    { type: 'reporta', from: 'elisa', to: 'ramiro' },
    { type: 'reporta', from: 'tomas', to: 'ramiro' },
    { type: 'reporta', from: 'nuria', to: 'pablo' },
    { type: 'reporta', from: 'rosa', to: 'ines' },

    // Pagos
    {
      type: 'pago',
      from: 'autoridad',
      to: 'varela_const',
      values: { pago_importe: 14400000, pago_fecha: '2024-04-15', pago_concepto: 'Primera certificación de obra' },
    },
    {
      type: 'pago',
      from: 'varela_const',
      to: 'hormigones',
      values: { pago_importe: 1200000, pago_fecha: '2024-06-02', pago_concepto: 'Factura HS-118' },
    },
    {
      type: 'pago',
      from: 'varela_const',
      to: 'lumen',
      values: { pago_importe: 950000, pago_fecha: '2024-04-20', pago_concepto: 'Asesoramiento estratégico' },
    },
    {
      type: 'pago',
      from: 'varela_const',
      to: 'abaco',
      values: { pago_importe: 180000, pago_fecha: '2024-03-01', pago_concepto: 'Informe técnico' },
    },
    {
      type: 'pago',
      from: 'lumen',
      to: 'tomas',
      values: { pago_importe: 410000, pago_fecha: '2024-06-30', pago_concepto: 'Tres ingresos en IS-7720' },
    },
    {
      type: 'pago',
      from: 'lumen',
      to: 'fundacion',
      values: { pago_importe: 250000, pago_fecha: '2024-05-12', pago_concepto: 'Donación' },
    },
    {
      type: 'pago',
      from: 'fundacion',
      to: 'rosa',
      values: { pago_importe: 36000, pago_fecha: '2024-04-01', pago_concepto: 'Beca anual' },
    },
    {
      type: 'pago',
      from: 'fundacion',
      to: 'marta',
      values: { pago_importe: 30000, pago_fecha: '2024-07-01', pago_concepto: 'Conferencia' },
    },
    {
      type: 'pago',
      from: 'ayto',
      to: 'diario',
      values: { pago_importe: 220000, pago_fecha: '2024-02-01', pago_concepto: 'Publicidad institucional' },
    },
    {
      type: 'pago',
      from: 'ayto',
      to: 'radio',
      values: { pago_importe: 60000, pago_fecha: '2024-02-01', pago_concepto: 'Publicidad institucional' },
    },

    // Reuniones
    { type: 'asiste', from: 'ramiro', to: 'cena' },
    { type: 'asiste', from: 'marta', to: 'cena' },
    { type: 'asiste', from: 'esteban', to: 'cena' },
    { type: 'asiste', from: 'julian', to: 'cena' },
    { type: 'asiste', from: 'julian', to: 'reunion_urb' },
    { type: 'asiste', from: 'elisa', to: 'reunion_urb' },
    { type: 'asiste', from: 'nuria', to: 'reunion_urb' },
    { type: 'asiste', from: 'tomas', to: 'regata' },
    { type: 'asiste', from: 'esteban', to: 'regata' },
    { type: 'asiste', from: 'diego', to: 'regata' },

    // Documentos que mencionan actores
    { type: 'menciona', from: 'doc_contrato', to: 'varela_const' },
    { type: 'menciona', from: 'doc_contrato', to: 'autoridad' },
    { type: 'menciona', from: 'doc_informe', to: 'varela_const' },
    { type: 'menciona', from: 'doc_informe', to: 'dragados' },
    { type: 'menciona', from: 'doc_factura', to: 'hormigones' },
    { type: 'menciona', from: 'doc_factura', to: 'varela_const' },
    { type: 'menciona', from: 'doc_extracto', to: 'lumen' },
    { type: 'menciona', from: 'doc_reparo', to: 'ayto' },
    { type: 'menciona', from: 'doc_acta', to: 'julian' },

    // Vínculos personales
    { type: 'vinculo', from: 'ramiro', to: 'esteban', values: { vinculo_clase: 'Amistad' } },
    { type: 'vinculo', from: 'diego', to: 'tomas', values: { vinculo_clase: 'Amistad' } },
    { type: 'vinculo', from: 'carmen', to: 'julian', values: { vinculo_clase: 'Enemistad' } },
    { type: 'vinculo', from: 'lucia', to: 'carmen', values: { vinculo_clase: 'Confianza' } },

    // Fuentes y periodista
    { type: 'informa', from: 'gaviota', to: 'lucia', values: { informa_desde: '2024-05-10' } },
    { type: 'informa', from: 'caracol', to: 'lucia', values: { informa_desde: '2024-07-02' } },
    { type: 'informa', from: 'carmen', to: 'lucia', values: { informa_desde: '2024-07-20' } },
  ];

  return buildProject({
    name: 'Ejemplo: Caso Puerto Norte',
    fieldLibrary: [
      field({ id: LIB.nombre, label: 'Nombre', isTitle: true, required: true }),
      field({
        id: LIB.fiabilidad,
        label: 'Fiabilidad',
        type: 'scale',
        description: 'De 1 (rumor) a 5 (documento verificado).',
      }),
      field({ id: LIB.etiquetas, label: 'Etiquetas', type: 'tags', nodeDisplay: 'text' }),
      field({ id: LIB.notas, label: 'Notas de la investigación', type: 'longText' }),
    ],
    schemas: [
      // ---- Entidades ----------------------------------------------------------------------
      entity({
        id: 'actor',
        name: 'Actor',
        isAbstract: true,
        icon: 'hexagon',
        color: '#8d7dff',
        description:
          'Cualquiera que pueda pagar, cobrar, firmar o controlar algo. No se instancia: es la base de Persona y Organización.',
        fields: [
          link(LIB.nombre),
          link(LIB.etiquetas),
          field({
            id: 'actor_pagos_recibidos',
            label: 'Pagos',
            type: 'computed',
            formula: '{contar(relaciones:Pago)}',
            description: 'Pagos en los que participa (emitidos o recibidos).',
          }),
        ],
      }),
      entity({
        id: 'persona',
        name: 'Persona',
        parentTypeId: 'actor',
        icon: 'user',
        color: '#8d7dff',
        description: 'Hereda de Actor. Las fuentes confidenciales son un subtipo.',
        fields: [
          field({
            id: 'per_genero',
            label: 'Género',
            key: 'genero',
            type: 'gender',
            description: 'Decide el nombre de los parentescos.',
          }),
          field({ id: 'per_cargo', label: 'Cargo', nodeDisplay: 'text' }),
          field({ id: 'per_nac', label: 'Fecha de nacimiento', type: 'date' }),
          field({
            id: 'per_imputado',
            label: 'Imputado',
            type: 'boolean',
            defaultValue: false,
            icon: 'gavel',
            nodeDisplay: 'icon',
          }),
          field({
            id: 'per_abogado',
            label: 'Abogado/a',
            type: 'nodeRef',
            referenceTypeIds: ['persona'],
            description: 'Se dibuja como vínculo en el mapa.',
          }),
          field({ id: 'per_reuniones', label: 'Reuniones', type: 'computed', formula: '{lista(relaciones:Asiste a)}' }),
        ],
      }),
      entity({
        id: 'fuente',
        name: 'Fuente',
        parentTypeId: 'persona',
        icon: 'venetian-mask',
        color: '#5bd6c4',
        description: 'Persona que informa de forma confidencial. Hereda todo lo de Persona y añade canal y fiabilidad.',
        fields: [
          field({
            id: 'fuente_canal',
            label: 'Canal',
            type: 'select',
            options: ['Mensajería cifrada', 'En persona', 'Correo', 'Teléfono'],
            nodeDisplay: 'text',
          }),
          link(LIB.fiabilidad),
        ],
      }),
      entity({
        id: 'organizacion',
        name: 'Organización',
        parentTypeId: 'actor',
        isAbstract: true,
        icon: 'building',
        color: '#67a9ff',
        description: 'Base de Empresa, Institución y Medio.',
        fields: [
          field({
            id: 'org_sector',
            label: 'Sector',
            type: 'select',
            options: ['Construcción', 'Financiero', 'Consultoría', 'Fundación', 'Comunicación', 'Administración'],
          }),
          field({ id: 'org_sede', label: 'Sede', type: 'nodeRef', referenceTypeIds: ['lugar'] }),
        ],
      }),
      entity({
        id: 'empresa',
        name: 'Empresa',
        parentTypeId: 'organizacion',
        icon: 'factory',
        color: '#67a9ff',
        allowedChildTypeIds: ['empresa'],
        description: 'Sociedades y fundaciones. Las filiales cuelgan de su matriz.',
        fields: [
          field({ id: 'emp_capital', label: 'Capital social (€)', type: 'number' }),
          field({ id: 'emp_admin', label: 'Administrador/a', type: 'nodeRef', referenceTypeIds: ['persona'] }),
          field({ id: 'emp_filiales', label: 'Filiales', type: 'computed', formula: '{lista(hijos)}' }),
        ],
      }),
      entity({
        id: 'institucion',
        name: 'Institución',
        parentTypeId: 'organizacion',
        icon: 'landmark',
        color: '#d7c45d',
        allowedChildTypeIds: ['institucion'],
        description: 'Administraciones públicas y sus departamentos.',
        fields: [
          field({
            id: 'inst_ambito',
            label: 'Ámbito',
            type: 'select',
            options: ['Municipal', 'Autonómico', 'Estatal'],
            nodeDisplay: 'text',
          }),
        ],
      }),
      entity({
        id: 'medio',
        name: 'Medio',
        parentTypeId: 'organizacion',
        icon: 'megaphone',
        color: '#ff9f68',
        fields: [
          field({
            id: 'medio_clase',
            label: 'Clase',
            type: 'select',
            options: ['Prensa', 'Radio', 'TV', 'Digital'],
            nodeDisplay: 'text',
          }),
        ],
      }),
      entity({
        id: 'lugar',
        name: 'Lugar',
        icon: 'map-pin',
        color: '#77d28f',
        allowedChildTypeIds: ['lugar'],
        fields: [
          link(LIB.nombre),
          field({
            id: 'lugar_clase',
            label: 'Clase',
            type: 'select',
            options: ['País', 'Ciudad', 'Edificio'],
            nodeDisplay: 'text',
          }),
        ],
      }),
      entity({
        id: 'cuenta',
        name: 'Cuenta bancaria',
        icon: 'wallet',
        color: '#ff7f9d',
        fields: [
          field({ id: 'cuenta_id', label: 'Identificador', isTitle: true, required: true }),
          field({
            id: 'cuenta_titular',
            label: 'Titular',
            type: 'nodeRef',
            referenceTypeIds: ['actor'],
            description: 'Referencia dibujada como vínculo.',
          }),
          field({ id: 'cuenta_pais', label: 'País', type: 'nodeRef', referenceTypeIds: ['lugar'] }),
        ],
      }),
      entity({
        id: 'documento',
        name: 'Documento',
        icon: 'scroll-text',
        color: '#d7c45d',
        fields: [
          field({ id: 'doc_titulo', label: 'Título', isTitle: true, required: true }),
          field({
            id: 'doc_clase',
            label: 'Clase',
            type: 'select',
            options: ['Contrato', 'Acta', 'Informe', 'Correo', 'Factura', 'Extracto bancario'],
            nodeDisplay: 'text',
          }),
          field({ id: 'doc_fecha', label: 'Fecha', type: 'date' }),
          field({ id: 'doc_firmantes', label: 'Firmado por', type: 'nodeRefs', referenceTypeIds: ['persona'] }),
          link(LIB.fiabilidad),
          field({ id: 'doc_enlace', label: 'Enlace', type: 'url' }),
          field({ id: 'doc_resumen', label: 'Resumen', type: 'longText' }),
        ],
      }),
      entity({
        id: 'reunion',
        name: 'Reunión',
        icon: 'calendar-days',
        color: '#e37ad8',
        fields: [
          field({ id: 'reunion_titulo', label: 'Título', isTitle: true, required: true }),
          field({ id: 'reunion_fecha', label: 'Fecha', type: 'date', nodeDisplay: 'text' }),
          field({ id: 'reunion_lugar', label: 'Lugar', type: 'nodeRef', referenceTypeIds: ['lugar'] }),
          link(LIB.fiabilidad),
          field({
            id: 'reunion_asistentes',
            label: 'Asistentes',
            type: 'computed',
            formula: '{lista(relaciones:Asiste a)}',
          }),
          field({ id: 'reunion_tema', label: 'Qué se trató', type: 'longText' }),
        ],
      }),

      // ---- Relaciones ---------------------------------------------------------------------
      relationType({
        id: 'familia',
        name: 'Familia',
        icon: 'users',
        color: '#8d7dff',
        genealogical: true,
        reciprocal: true,
        sourceTypeIds: ['persona'],
        targetTypeIds: ['persona'],
        description: 'Parentesco con género: «Padre», «Hija», «Pareja»…',
      }),
      relationType({
        id: 'controla',
        name: 'Controla',
        inverseName: 'Controlada por',
        icon: 'key',
        color: '#67a9ff',
        sourceTypeIds: ['actor'],
        targetTypeIds: ['empresa', 'medio'],
        relationStyle: 'strong',
        fields: [field({ id: 'controla_pct', label: 'Participación (%)', type: 'number' })],
      }),
      relationType({
        id: 'trabaja',
        name: 'Trabaja en',
        inverseName: 'Emplea a',
        icon: 'briefcase',
        color: '#d7c45d',
        sourceTypeIds: ['persona'],
        targetTypeIds: ['organizacion'],
        fields: [
          field({ id: 'trabaja_cargo', label: 'Cargo' }),
          field({ id: 'trabaja_desde', label: 'Desde', type: 'date' }),
        ],
      }),
      relationType({
        id: 'preside',
        name: 'Preside',
        inverseName: 'Presidida por',
        icon: 'crown',
        color: '#d7c45d',
        sourceTypeIds: ['persona'],
        targetTypeIds: ['institucion'],
        maxPerTarget: 1,
        description: 'Una institución solo puede tener una persona al frente (límite de cardinalidad).',
      }),
      relationType({
        id: 'reporta',
        name: 'Reporta a',
        inverseName: 'Superior de',
        icon: 'git-fork',
        color: '#8d7dff',
        structural: true,
        parentEnd: 'target',
        sourceTypeIds: ['persona'],
        targetTypeIds: ['persona'],
        relationStyle: 'hidden',
        description: 'Organigrama. Es estructural: en «Ver por» aparece como jerarquía alternativa.',
      }),
      relationType({
        id: 'pago',
        name: 'Pago',
        inverseName: 'Cobra de',
        icon: 'hand-coins',
        color: '#ff7f9d',
        sourceTypeIds: ['actor'],
        targetTypeIds: ['actor'],
        relationStyle: 'strong',
        fields: [
          field({ id: 'pago_importe', label: 'Importe (€)', type: 'number', required: true }),
          field({ id: 'pago_fecha', label: 'Fecha', type: 'date' }),
          field({ id: 'pago_concepto', label: 'Concepto' }),
        ],
      }),
      relationType({
        id: 'asiste',
        name: 'Asiste a',
        inverseName: 'Con la asistencia de',
        icon: 'calendar-days',
        color: '#e37ad8',
        sourceTypeIds: ['persona'],
        targetTypeIds: ['reunion'],
      }),
      relationType({
        id: 'menciona',
        name: 'Menciona a',
        inverseName: 'Mencionado en',
        icon: 'scroll-text',
        color: '#d7c45d',
        sourceTypeIds: ['documento'],
        targetTypeIds: ['actor'],
      }),
      relationType({
        id: 'vinculo',
        name: 'Vínculo personal',
        icon: 'heart-handshake',
        color: '#5bd6c4',
        directed: false,
        sourceTypeIds: ['persona'],
        targetTypeIds: ['persona'],
        fields: [
          field({
            id: 'vinculo_clase',
            label: 'Naturaleza',
            type: 'select',
            options: ['Amistad', 'Enemistad', 'Confianza'],
          }),
        ],
      }),
      relationType({
        id: 'informa',
        name: 'Informa a',
        inverseName: 'Informada por',
        icon: 'mic',
        color: '#5bd6c4',
        sourceTypeIds: ['persona'],
        targetTypeIds: ['persona'],
        fields: [field({ id: 'informa_desde', label: 'Desde', type: 'date' })],
      }),
    ],
    nodes,
    relations,
    view: { layout: 'force', hiddenRelationTypeIds: ['reporta'] },
    lenses: [
      {
        id: 'lens_pn_dinero',
        name: 'Flujo de dinero',
        view: {
          layout: 'force',
          hiddenEntityTypeIds: ['documento', 'reunion', 'lugar', 'fuente'],
          hiddenRelationTypeIds: [
            'familia',
            'trabaja',
            'preside',
            'reporta',
            'asiste',
            'menciona',
            'vinculo',
            'informa',
          ],
          hiddenReferenceFieldIds: [
            'per_abogado',
            'org_sede',
            'cuenta_pais',
            'emp_admin',
            'doc_firmantes',
            'reunion_lugar',
          ],
          showHierarchy: false,
        },
      },
      {
        id: 'lens_pn_familia',
        name: 'Familias y cargos',
        view: {
          layout: 'genealogy',
          hiddenEntityTypeIds: ['documento', 'reunion', 'lugar', 'cuenta', 'empresa', 'medio', 'fuente'],
          hiddenRelationTypeIds: ['controla', 'trabaja', 'reporta', 'pago', 'asiste', 'menciona', 'vinculo', 'informa'],
          hiddenReferenceFieldIds: [
            'per_abogado',
            'org_sede',
            'cuenta_pais',
            'emp_admin',
            'doc_firmantes',
            'reunion_lugar',
            'cuenta_titular',
          ],
          showHierarchy: false,
        },
      },
      {
        id: 'lens_pn_reuniones',
        name: 'Quién estuvo dónde',
        view: {
          layout: 'force',
          hiddenEntityTypeIds: ['documento', 'cuenta', 'empresa', 'institucion', 'medio', 'fuente'],
          hiddenRelationTypeIds: [
            'familia',
            'controla',
            'trabaja',
            'preside',
            'reporta',
            'pago',
            'menciona',
            'vinculo',
            'informa',
          ],
          hiddenReferenceFieldIds: [
            'per_abogado',
            'org_sede',
            'cuenta_pais',
            'emp_admin',
            'doc_firmantes',
            'cuenta_titular',
          ],
          showHierarchy: false,
        },
      },
      {
        id: 'lens_pn_pruebas',
        name: 'Pruebas y fuentes',
        view: {
          layout: 'force',
          hiddenEntityTypeIds: ['cuenta', 'lugar', 'reunion'],
          hiddenRelationTypeIds: ['familia', 'controla', 'trabaja', 'preside', 'reporta', 'pago', 'asiste', 'vinculo'],
          hiddenReferenceFieldIds: [
            'per_abogado',
            'org_sede',
            'cuenta_pais',
            'emp_admin',
            'cuenta_titular',
            'reunion_lugar',
          ],
          showHierarchy: false,
        },
      },
    ],
    queries: [
      {
        id: 'q_pn_sin_abogado',
        name: 'Imputados sin abogado',
        typeId: 'persona',
        conditions: [
          { kind: 'field', fieldId: 'per_imputado', op: 'equals', value: 'sí' },
          { kind: 'field', fieldId: 'per_abogado', op: 'empty', value: '' },
        ],
      },
      {
        id: 'q_pn_poco_fiables',
        name: 'Documentos poco fiables',
        typeId: 'documento',
        conditions: [{ kind: 'field', fieldId: LIB.fiabilidad, op: 'lt', value: '3' }],
      },
      {
        id: 'q_pn_sin_admin',
        name: 'Empresas sin administrador conocido',
        typeId: 'empresa',
        conditions: [{ kind: 'field', fieldId: 'emp_admin', op: 'empty', value: '' }],
      },
      {
        id: 'q_pn_cobran_sin_trabajar',
        name: 'Personas que cobran sin trabajar en ninguna organización',
        typeId: 'persona',
        conditions: [
          { kind: 'relation', typeId: 'pago', presence: 'has', end: 'target' },
          { kind: 'relation', typeId: 'trabaja', presence: 'lacks', end: 'source' },
        ],
      },
    ],
  });
}
