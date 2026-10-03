import { Modal } from '../common/Modal';

const GROUPS: { title: string; items: [string, string[]][] }[] = [
  {
    title: 'General',
    items: [
      ['Mostrar esta ayuda', ['?']],
      ['Buscar y saltar a cualquier cosa', ['Ctrl', 'K']],
      ['Volver al elemento anterior / siguiente', ['Alt', '←', '→']],
      ['Deshacer', ['Ctrl', 'Z']],
      ['Rehacer', ['Ctrl', 'Shift', 'Z']],
      ['Ir al mapa', ['Alt', '1']],
      ['Ir a tipos y propiedades', ['Alt', '2']],
    ],
  },
  {
    title: 'Mapa',
    items: [
      ['Mostrar u ocultar la estructura', ['[']],
      ['Cerrar el inspector', ['Esc']],
      ['Eliminar el elemento seleccionado', ['Supr']],
    ],
  },
  {
    title: 'Árbol de estructura',
    items: [
      ['Moverse entre nodos', ['↑', '↓']],
      ['Plegar o desplegar', ['←', '→']],
      ['Primer o último nodo', ['Inicio', 'Fin']],
      ['Seleccionar el nodo', ['Intro']],
    ],
  },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Atajos de teclado" informational onClose={onClose}>
      {GROUPS.map(group => (
        <section className="shortcut-group" key={group.title}>
          <h3>{group.title}</h3>
          <dl className="shortcut-list">
            {group.items.map(([label, keys]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {keys.map(key => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="muted-note" style={{ marginTop: 'var(--space-4)' }}>
        En macOS, usa ⌘ en lugar de Ctrl. Los atajos no actúan mientras escribes en un campo.
      </p>
    </Modal>
  );
}
