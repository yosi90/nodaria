import { normalizeName } from './notes';
import { parseDate } from './calendar';
import { allFields, typeMatches } from './selectors';
import type { FieldDefinition, Project } from './types';

/** Valida nombres y sintaxis sin depender de que una ficha tenga valores rellenados. */
export function formulaWarnings(
  project: Project,
  fields: FieldDefinition[],
  formula: string,
  kind: 'entity' | 'relationship' = 'entity',
): string[] {
  const warnings = new Set<string>();
  const find = (available: FieldDefinition[], name: string) =>
    available.find(f => normalizeName(f.key) === normalizeName(name) || normalizeName(f.label) === normalizeName(name));
  const unknown = (name: string) => warnings.add(`El atributo «${name}» no está definido en este tipo.`);
  const dateParts = ['dia', 'mes', 'anio', 'ano', 'year', 'diasemana'];

  const checkPath = (path: string, available: FieldDefinition[], date = false): void => {
    const text = path.trim();
    if (date && parseDate(text)) return;
    const [head, ...rest] = text.split('.').map(part => part.trim());
    const name = normalizeName(head);
    if (kind === 'entity' && name === 'hoy') {
      if (rest.length && (date || rest.length !== 1 || !dateParts.includes(normalizeName(rest[0]))))
        warnings.add(`«${text}» no es una fecha ni una parte de fecha válida.`);
      return;
    }
    if (kind === 'entity' && ['titulo', 'tipo', 'padre'].includes(name) && !rest.length && !date) return;
    if (kind === 'entity' && name === 'padre' && rest.length) {
      checkTargets(
        rest.join('.'),
        project.schemas.filter(s => s.kind === 'entity').map(s => allFields(project, s.id)),
        date,
      );
      return;
    }
    const field = find(available, head);
    if (!field) {
      unknown(head || text);
      return;
    }
    if (!rest.length) {
      if (date && field.type !== 'date') warnings.add(`El atributo «${head}» debe ser de tipo Fecha.`);
      return;
    }
    if (field.type === 'date' && !date && rest.length === 1 && dateParts.includes(normalizeName(rest[0]))) return;
    if (field.type === 'nodeRef' || field.type === 'nodeRefs') {
      const targets = project.schemas.filter(
        s => s.kind === 'entity' && typeMatches(project, s.id, field.referenceTypeIds),
      );
      checkTargets(
        rest.join('.'),
        targets.map(s => allFields(project, s.id)),
        date,
      );
    } else warnings.add(`No se puede leer «${rest.join('.')}» a través del atributo «${head}».`);
  };

  // Una referencia puede admitir varios tipos: basta con que la ruta sea válida en alguno.
  const checkTargets = (path: string, candidates: FieldDefinition[][], date: boolean): void => {
    if (!candidates.length) return;
    const original = [...warnings];
    let first: string[] = [];
    for (const candidate of candidates) {
      warnings.clear();
      checkPath(path, candidate, date);
      if (!warnings.size) {
        first = [];
        break;
      }
      if (!first.length) first = [...warnings];
    }
    warnings.clear();
    [...original, ...first].forEach(w => warnings.add(w));
  };

  const matches = [...formula.matchAll(/\{([^{}]+)\}/g)];
  if (/[{}]/.test(formula.replace(/\{([^{}]+)\}/g, '')))
    warnings.add('Revisa las llaves: cada expresión debe escribirse entre { y }.');
  for (const match of matches) {
    const expression = match[1].trim();
    if (kind === 'relationship') {
      // Las relaciones conservan el motor de sustitución simple por clave.
      if (!fields.some(f => f.key === expression))
        warnings.add(
          `«${expression}» no es una clave de atributo de esta relación. Las relaciones solo admiten {clave}.`,
        );
      continue;
    }
    const call = /^(contar|lista|edad|dias|diasemana)\s*\(\s*([^)]*)\s*\)$/i.exec(expression);
    if (!call) {
      if (/[()]/.test(expression))
        warnings.add(`La expresión «${expression}» no se reconoce. Revisa la función y sus paréntesis.`);
      else checkPath(expression, fields);
      continue;
    }
    const fn = normalizeName(call[1]);
    if (fn === 'contar' || fn === 'lista') {
      const [subject, type = ''] = call[2]
        .trim()
        .split(':')
        .map(part => part.trim());
      const name = normalizeName(subject);
      if (name === 'relaciones') {
        if (
          type &&
          !project.schemas.some(s => s.kind === 'relationship' && normalizeName(s.name) === normalizeName(type))
        )
          warnings.add(`El tipo de relación «${type}» no está definido.`);
      } else if (name !== 'hijos' && !find(fields, subject)) unknown(subject);
    } else {
      const args = call[2].split(',').map(arg => arg.trim());
      if (!args[0] || args.some(arg => !arg) || args.length > (fn === 'diasemana' ? 1 : 2))
        warnings.add(
          `Revisa los argumentos de «${fn}»: ${fn === 'diasemana' ? 'necesita una fecha' : 'necesita una o dos fechas'}.`,
        );
      else args.forEach(arg => checkPath(arg, fields, true));
    }
  }
  return [...warnings];
}
