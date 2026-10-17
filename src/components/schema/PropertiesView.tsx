import { useProjectAccess } from '../../state/groups';
import { LibraryEditor } from './LibraryEditor';

/** Vista «Propiedades»: las preformas de atributo compartidas por los tipos. */
export function PropertiesView() {
  const { canEditSchema } = useProjectAccess();
  return (
    <main className="properties-layout">
      <fieldset className="access-lock" disabled={!canEditSchema}>
        <LibraryEditor />
      </fieldset>
    </main>
  );
}
