import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { useNavigation, type View } from '../../state/navigation';
import { useTour } from '../../state/tour';
import { Button, IconButton } from '../common/Button';

/*
 * Recorrido guiado. Cada paso señala un elemento marcado con `data-tour="…"`, cambia de vista si
 * hace falta y, en algún caso, selecciona un nodo para que la ficha esté abierta. Si el elemento
 * no existe (por ejemplo, el ejemplo se borró), el paso se muestra centrado sin resaltar nada.
 */

interface Step {
  target: string;
  title: string;
  body: string;
  view?: View;
  /** Nodo que seleccionar antes de mostrar el paso (si existe en el proyecto). */
  selectNode?: string;
}

const STEPS: Step[] = [
  {
    target: 'project',
    title: 'Tu proyecto',
    body: 'Aquí cambias de proyecto o abres más ejemplos; el engranaje de al lado lo renombra, lo exporta o ajusta su calendario. «Ejemplo: Coches» es ya una copia tuya: cámbialo sin miedo.',
    view: 'map',
  },
  {
    target: 'views',
    title: 'Datos y esquema',
    body: 'A la izquierda, las vistas de datos: Mapa, Tabla y Salud. A la derecha, el esquema: qué Tipos existen, qué Relaciones los unen y las Propiedades compartidas. Alt+1…6 salta entre ellas.',
    view: 'map',
  },
  {
    target: 'structure',
    title: 'La estructura',
    body: 'Los nodos se organizan en un árbol: cada marca contiene sus modelos. Un tipo decide qué puede contener («Subnodos permitidos»). Con «Ver por» eliges otra jerarquía basada en una relación estructural.',
    view: 'map',
  },
  {
    target: 'canvas',
    title: 'El lienzo',
    body: 'Cada tarjeta es un nodo; cada línea, una relación. Doble clic en el vacío crea un nodo; arrastra desde el borde de una tarjeta hasta otra para relacionarlas. La rueda acerca y aleja.',
    view: 'map',
  },
  {
    target: 'inspector',
    title: 'La ficha',
    body: 'Al seleccionar un nodo se abre su ficha: sus atributos, sus relaciones y notas con menciones [[así]]. «Piezas montadas» es un atributo calculado: cuenta las relaciones «Monta» por ti.',
    view: 'map',
    selectNode: 'corsa',
  },
  {
    target: 'layouts',
    title: 'Disposiciones y vistas guardadas',
    body: 'Árbol, fuerzas, radial, genealogía o sobre una imagen: la misma información, distinta forma. Cada disposición recuerda sus propios filtros, y el menú de la izquierda guarda vistas con nombre («Rivales»).',
    view: 'map',
  },
  {
    target: 'attributes',
    title: 'Los tipos',
    body: 'Un tipo define sus atributos (texto, número, lista, fecha, escala, referencia…), su apariencia y qué subnodos admite. Un tipo puede heredar de otro y reutilizar «preformas» compartidas.',
    view: 'schema',
  },
  {
    target: 'views',
    title: 'Las relaciones',
    body: 'En «Relaciones» defines cómo se conectan los tipos: desde qué tipo a cuál, con nombre inverso («Monta» / «Montada en»), simétricas, con atributos propios, genealógicas o estructurales.',
    view: 'relations',
  },
  {
    target: 'table',
    title: 'La tabla',
    body: 'Una hoja por tipo para rellenar o revisar muchas fichas de golpe. Marca varias filas para cambiarlas de tipo, moverlas, etiquetarlas o borrarlas a la vez.',
    view: 'table',
  },
  {
    target: 'health',
    title: 'Salud y ayuda',
    body: 'Salud revisa el mundo por ti: fichas incompletas, nodos sueltos, consultas guardadas y estadísticas. Cuando quieras repetir este recorrido o abrir el caso complejo, pulsa «?» arriba a la derecha.',
    view: 'health',
  },
];

const PAD = 6;
const CARD_W = 360;
const GAP = 14;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function Tour() {
  const { step, next, prev, stop, setTotal } = useTour();
  const { setView, select } = useNavigation();
  const { project } = useApp();
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => setTotal(STEPS.length), [setTotal]);

  const current = step === null ? null : STEPS[step];

  // Al entrar en un paso: cambiar de vista y seleccionar si hace falta.
  useEffect(() => {
    if (!current) return;
    if (current.view) setView(current.view);
    if (current.selectNode && project.nodes.some(n => n.id === current.selectNode))
      select({ kind: 'node', id: current.selectNode });
    // Solo al cambiar de paso: el proyecto cambia con cada edición y no debe reseleccionar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, setView, select]);

  // Medir el elemento señalado y seguirlo si la ventana cambia.
  useLayoutEffect(() => {
    if (!current) {
      setBox(null);
      return;
    }
    let frame = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
      } else if (tries++ > 20) setBox(null);
      // La vista puede tardar un instante en montarse: se reintenta unos frames.
      if (!el && tries <= 20) frame = requestAnimationFrame(measure);
    };
    measure();
    const onResize = () => {
      tries = 0;
      measure();
    };
    window.addEventListener('resize', onResize);
    const interval = window.setInterval(onResize, 600);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      window.clearInterval(interval);
    };
  }, [current]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, next, prev, stop]);

  if (step === null || !current) return null;

  const card = placeCard(box);
  const last = step === STEPS.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? <div className="tour-spot" style={box} /> : <div className="tour-scrim" />}
      <div className="tour-card" style={card}>
        <div className="tour-head">
          <span className="tour-count">
            {step + 1} / {STEPS.length}
          </span>
          <IconButton icon={X} size="sm" label="Cerrar el recorrido" onClick={stop} />
        </div>
        <h3 id="tour-title">{current.title}</h3>
        <p>{current.body}</p>
        <div className="tour-actions">
          <Button size="sm" variant="ghost" icon={ArrowLeft} disabled={step === 0} onClick={prev}>
            Anterior
          </Button>
          <Button size="sm" variant="primary" icon={last ? undefined : ArrowRight} onClick={next} autoFocus>
            {last ? 'Terminar' : 'Siguiente'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Coloca la tarjeta junto al recuadro: debajo si cabe, si no encima, si no al lado; centrada sin recuadro. */
function placeCard(box: Box | null): { top: number; left: number; width: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_W, vw - 24);
  const estimatedH = 190;
  if (!box) return { top: Math.max(12, vh / 2 - estimatedH / 2), left: Math.max(12, vw / 2 - width / 2), width };
  const clampLeft = (left: number) => Math.min(Math.max(12, left), vw - width - 12);
  if (box.top + box.height + GAP + estimatedH < vh)
    return { top: box.top + box.height + GAP, left: clampLeft(box.left), width };
  if (box.top - GAP - estimatedH > 0) return { top: box.top - GAP - estimatedH, left: clampLeft(box.left), width };
  if (box.left + box.width + GAP + width < vw)
    return { top: Math.max(12, Math.min(box.top, vh - estimatedH - 12)), left: box.left + box.width + GAP, width };
  return { top: Math.max(12, Math.min(box.top, vh - estimatedH - 12)), left: clampLeft(box.left - GAP - width), width };
}
