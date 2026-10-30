import { parseDate } from './calendar';
import { formulaWarnings } from './formulaDiagnostics';
import { declaredFields, isFieldLink, usersOfLibraryField } from './library';
import { normalizeName } from './text';
import { allFields, getSchema, typeMatches } from './selectors';
import type { FieldDefinition, Project, Schema } from './types';

/*
 * Las fórmulas citan los atributos por su clave o su etiqueta (`formulas.ts`). Al renombrar un atributo,
 * las fórmulas que lo citan se reescriben con la clave nueva. Cada nombre de la fórmula se resuelve con
 * las mismas reglas que la evaluación, en el proyecto de antes del cambio: el atributo del propio tipo,
 * el que se alcanza a través de una referencia o de «padre», y los argumentos de las funciones. Solo se
 * cambia lo que apunta a ese atributo concreto, no cualquier otro que se llame igual en otro tipo.
 * Lo que no se pueda reescribir lo avisa Salud (`formulaIssues`).
 */

/** Atributos renombrados (clave o etiqueta distinta) entre dos versiones del proyecto: id → clave nueva. */
export function renamedFields(before: Project, after: Project): Map<string, string> {
  const definitions = (p: Project) => {
    const map = new Map<string, FieldDefinition>();
    for (const schema of p.schemas) for (const f of schema.fields) if (!isFieldLink(f)) map.set(f.id, f);
    for (const f of p.fieldLibrary) map.set(f.id, f);
    return map;
  };
  const old = definitions(before);
  const renamed = new Map<string, string>();
  for (const [id, field] of definitions(after)) {
    const previous = old.get(id);
    if (previous && (previous.key !== field.key || previous.label !== field.label)) renamed.set(id, field.key);
  }
  return renamed;
}

const find = (available: FieldDefinition[], name: string) => {
  const wanted = normalizeName(name);
  return available.find(f => normalizeName(f.key) === wanted || normalizeName(f.label) === wanted);
};

const entityFields = (p: Project) => p.schemas.filter(s => s.kind === 'entity').flatMap(s => allFields(p, s.id));

const targetFields = (p: Project, field: FieldDefinition) =>
  p.schemas
    .filter(s => s.kind === 'entity' && typeMatches(p, s.id, field.referenceTypeIds))
    .flatMap(s => allFields(p, s.id));

/** Reescribe una ruta («clave», «ref.clave», «padre.clave») con las claves nuevas; sin cambios, la misma. */
function rewritePath(p: Project, path: string, available: FieldDefinition[], renamed: Map<string, string>) {
  let fields: FieldDefinition[] | null = available;
  let changed = false;
  const parts = path.split('.').map((raw, index) => {
    const name = raw.trim();
    if (!fields || !name) return raw;
    const lower = normalizeName(name);
    if (index === 0 && ['hoy', 'titulo', 'tipo'].includes(lower)) {
      fields = null;
      return raw;
    }
    if (index === 0 && lower === 'padre') {
      fields = entityFields(p);
      return raw;
    }
    const field = find(fields, name);
    if (!field) {
      fields = null;
      return raw;
    }
    fields = field.type === 'nodeRef' || field.type === 'nodeRefs' ? targetFields(p, field) : null;
    const next = renamed.get(field.id);
    if (!next || next === name) return raw;
    changed = true;
    return raw.replace(name, next);
  });
  return changed ? parts.join('.') : path;
}

/** Reescribe una fórmula de un tipo de entidad (`available`: sus atributos en el proyecto de antes). */
export function rewriteFormula(
  p: Project,
  formula: string,
  available: FieldDefinition[],
  renamed: Map<string, string>,
): string {
  return formula.replace(/\{([^{}]+)\}/g, (whole, inner: string) => {
    const call = /^(\s*)(contar|lista|edad|dias|diasemana)(\s*\(\s*)([^)]*?)(\s*\)\s*)$/i.exec(inner);
    if (!call) {
      const next = rewritePath(p, inner, available, renamed);
      return next === inner ? whole : `{${next}}`;
    }
    const [, lead, fn, open, args, close] = call;
    let rewritten: string;
    if (['contar', 'lista'].includes(normalizeName(fn))) {
      // contar(clave) o lista(clave): un atributo del propio nodo; «relaciones» e «hijos» no son atributos.
      const [subject, ...type] = args.split(':');
      const name = subject.trim();
      const special = ['relaciones', 'hijos'].includes(normalizeName(name));
      const field = special ? undefined : find(available, name);
      const next = field ? renamed.get(field.id) : undefined;
      rewritten = next && next !== name ? [subject.replace(name, next), ...type].join(':') : args;
    } else {
      rewritten = args
        .split(',')
        .map(arg =>
          parseDate(arg.trim()) || normalizeName(arg.trim()) === 'hoy' ? arg : rewritePath(p, arg, available, renamed),
        )
        .join(',');
    }
    return rewritten === args ? whole : `{${lead}${fn}${open}${rewritten}${close}}`;
  });
}

/** Las relaciones solo admiten {clave}: se cambia la clave antigua exacta por la nueva. */
function rewriteRelationFormula(formula: string, available: FieldDefinition[], renamed: Map<string, string>) {
  return formula.replace(/\{([^{}]+)\}/g, (whole, inner: string) => {
    const field = available.find(f => f.key === inner.trim());
    const next = field ? renamed.get(field.id) : undefined;
    return next && next !== inner.trim() ? `{${next}}` : whole;
  });
}

/**
 * El proyecto `after` con las fórmulas al día si el cambio desde `before` renombró atributos. Se resuelven
 * con los nombres de antes y se escriben con la clave nueva. `renamed` (id de antes → clave nueva) sirve
 * cuando el cambio también mueve atributos a otro id, como al pasar varios a una preforma.
 */
export function withRenamedFields(
  before: Project,
  after: Project,
  renamed: Map<string, string> = renamedFields(before, after),
): Project {
  if (!renamed.size) return after;
  let touched = false;
  const schemas = after.schemas.map(schema => {
    if (!getSchema(before, schema.id)) return schema;
    const available = allFields(before, schema.id);
    let changed = false;
    const fields = schema.fields.map(field => {
      if (isFieldLink(field) || field.type !== 'computed') return field;
      const formula =
        schema.kind === 'relationship'
          ? rewriteRelationFormula(field.formula, available, renamed)
          : rewriteFormula(before, field.formula, available, renamed);
      if (formula === field.formula) return field;
      changed = true;
      return { ...field, formula };
    });
    if (!changed) return schema;
    touched = true;
    return { ...schema, fields };
  });
  const fieldLibrary = after.fieldLibrary.map(field => {
    if (field.type !== 'computed') return field;
    // Una preforma se evalúa en cada tipo que la vincula: se resuelve con los atributos de todos ellos.
    const users = usersOfLibraryField(before, field.id).filter(s => s.kind === 'entity');
    const seen = new Set<string>();
    const available = (users.length ? users.flatMap(s => allFields(before, s.id)) : before.fieldLibrary).filter(f =>
      seen.has(f.id) ? false : (seen.add(f.id), true),
    );
    const formula = rewriteFormula(before, field.formula, available, renamed);
    if (formula === field.formula) return field;
    touched = true;
    return { ...field, formula };
  });
  return touched ? { ...after, schemas, fieldLibrary } : after;
}

export interface FormulaIssue {
  schema: Schema;
  field: FieldDefinition;
  warnings: string[];
}

/** Atributos calculados cuya fórmula cita nombres que no existen o está mal escrita, por tipo. */
export function formulaIssues(p: Project): FormulaIssue[] {
  const issues: FormulaIssue[] = [];
  for (const schema of p.schemas) {
    const available = allFields(p, schema.id);
    for (const field of declaredFields(p, schema)) {
      if (field.type !== 'computed' || !field.formula.trim()) continue;
      const warnings = formulaWarnings(p, available, field.formula, schema.kind);
      if (warnings.length) issues.push({ schema, field, warnings });
    }
  }
  return issues;
}
