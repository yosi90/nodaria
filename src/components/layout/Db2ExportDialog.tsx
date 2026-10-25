import { useEffect, useMemo, useState } from 'react';
import { db2Library, db2Model, db2Script, db2Sources, isSystemName } from '../../domain/db2Script';
import { rowCount } from '../../domain/rowsScript';
import { fileSafeName } from '../../domain/text';
import { downloadBytes, downloadText } from '../../services/files';
import { createZip } from '../../services/zip';
import { useApp } from '../../state/AppContext';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { OPEN_DB2_EXPORT_EVENT } from './openDb2Export';

/** Monta el diálogo cuando lo pide el engranaje o el menú de exportar del lienzo. */
export function Db2ExportHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_DB2_EXPORT_EVENT, show);
    return () => window.removeEventListener(OPEN_DB2_EXPORT_EVENT, show);
  }, []);
  return open ? <Db2ExportDialog onClose={() => setOpen(false)} /> : null;
}

/**
 * Exportar las tablas de Db2 for i: el script único, los miembros fuente SQL (QSQLSRC) y los DDS (QDDSSRC),
 * con sus programas CL y las órdenes de carga. Se eligen las tablas que se crean: las demás ya existen en
 * la biblioteca (`db2Script.ts`).
 */
export function Db2ExportDialog({ onClose }: { onClose: () => void }) {
  const { project } = useApp();
  const tables = useMemo(() => db2Model(project), [project]);
  const [library, setLibrary] = useState(() => db2Library(project));
  const [folder, setFolder] = useState('/tmp/nodaria');
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(tables.map(t => t.node.id)));
  const [script, setScript] = useState(true);
  const [sqlMembers, setSqlMembers] = useState(true);
  const [ddsMembers, setDdsMembers] = useState(false);
  const [withRows, setWithRows] = useState(true);
  // Las filas de ejemplo de las tablas que se crean (vista «Registros»).
  const rows = rowCount(project, [...chosen]);

  const libraryOk = isSystemName(library);
  const anything = script || sqlMembers || ddsMembers;
  const base = fileSafeName(project.name, 'proyecto');
  const toggle = (id: string, on: boolean) =>
    setChosen(current => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const download = () => {
    const now = new Date();
    const options = { library, tableIds: [...chosen], folder, rows: withRows };
    const scriptText = db2Script(project, now, options);
    if (script && !sqlMembers && !ddsMembers) {
      downloadText(`${base}.db2.sql`, scriptText, 'application/sql');
    } else {
      const sources =
        sqlMembers || ddsMembers ? db2Sources(project, now, { ...options, sql: sqlMembers, dds: ddsMembers }) : [];
      const entries = [
        ...(script ? [{ name: `${base}.db2.sql`, data: scriptText }] : []),
        ...sources.map(f => ({ name: f.path, data: f.text })),
      ];
      downloadBytes(`${base}.ibmi.zip`, createZip(entries, now));
    }
    onClose();
  };

  return (
    <Modal
      title="Exportar Db2 for i (IBM i)"
      wide
      submitLabel="Descargar"
      submitDisabled={!libraryOk || !chosen.size || !anything}
      onClose={onClose}
      onSubmit={download}
    >
      <div className="form-grid db2-export">
        <div className="db2-export-row">
          <label className="field">
            Biblioteca
            <input
              value={library}
              maxLength={10}
              spellCheck={false}
              onChange={e => setLibrary(e.target.value.toUpperCase())}
            />
            <small>{libraryOk ? 'Donde se crean las tablas.' : 'Hasta 10 caracteres: letras, números, _ @ # $.'}</small>
          </label>
          <label className="field">
            Carpeta del IFS
            <input value={folder} spellCheck={false} onChange={e => setFolder(e.target.value)} />
            <small>Adonde subes los miembros fuente para cargarlos.</small>
          </label>
        </div>
        <fieldset className="publish-options">
          <legend>Qué tablas se crean</legend>
          <p className="muted-note">
            Las que no marques ya existen en la biblioteca: sus claves foráneas desde las nuevas se crean igual.
          </p>
          <div className="db2-export-tools">
            <Button size="sm" variant="ghost" onClick={() => setChosen(new Set(tables.map(t => t.node.id)))}>
              Todas
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChosen(new Set())}>
              Ninguna
            </Button>
          </div>
          <div className="db2-export-tables">
            {tables.map(t => (
              <label key={t.node.id} className="field-inline">
                <input
                  type="checkbox"
                  checked={chosen.has(t.node.id)}
                  onChange={e => toggle(t.node.id, e.target.checked)}
                />
                <span>
                  {t.label} <code>{t.system}</code>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="publish-options">
          <legend>Qué se descarga</legend>
          <label className="field-inline">
            <input type="checkbox" checked={script} onChange={e => setScript(e.target.checked)} />
            Script SQL único, para «Ejecutar scripts SQL» de ACS
          </label>
          <label className="field-inline">
            <input type="checkbox" checked={sqlMembers} onChange={e => setSqlMembers(e.target.checked)} />
            Miembros fuente SQL (QSQLSRC) y su CL con RUNSQLSTM
          </label>
          <label className="field-inline">
            <input type="checkbox" checked={ddsMembers} onChange={e => setDdsMembers(e.target.checked)} />
            Miembros fuente DDS (PF y LF en QDDSSRC) y su CL con CRTPF y ADDPFCST
          </label>
          {rows > 0 && (
            <label className="field-inline">
              <input type="checkbox" checked={withRows} onChange={e => setWithRows(e.target.checked)} />
              Las filas de ejemplo ({rows}): INSERT antes de las claves foráneas (en los miembros, el miembro DATOS)
            </label>
          )}
          <small className="muted-note">
            Con miembros fuente se descarga un ZIP con <code>CARGAR.sql</code>: las órdenes para copiarlos a la
            biblioteca y compilar el CL.
          </small>
        </fieldset>
      </div>
    </Modal>
  );
}
