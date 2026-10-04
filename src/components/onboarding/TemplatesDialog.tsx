import { BookOpen, Compass, Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { TEMPLATES, type TemplateInfo } from '../../domain/templates';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { useTour } from '../../state/tour';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/*
 * Ejemplos y plantillas. Un ejemplo se abre como proyecto nuevo: una copia propia del usuario que
 * puede modificar, reutilizar o usar de base para el suyo. Los tipos de cualquier entrada se pueden
 * añadir al proyecto actual sin tocar sus datos.
 */

export function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { setView } = useNavigation();
  const { start } = useTour();
  const toast = useToast();
  const [tab, setTab] = useState<'example' | 'template'>('example');

  const open = (template: TemplateInfo, withTour = false) => {
    dispatch({ type: 'import-project', project: template.build(), replaceBlank: true });
    setView('map');
    toast({ message: `Proyecto «${template.name}» creado: es tu copia, cámbialo a tu gusto.` });
    onClose();
    if (withTour) window.setTimeout(start, 250);
  };
  const merge = (template: TemplateInfo) => {
    const built = template.build();
    const added = built.schemas.filter(s => !project.schemas.some(x => x.id === s.id)).length;
    dispatch({ type: 'merge-template', template: built });
    toast({
      message: added
        ? `${added} ${added === 1 ? 'tipo añadido' : 'tipos añadidos'} a «${project.name}»`
        : `«${project.name}» ya tiene los tipos de ${template.name}`,
      undoable: added > 0,
    });
    onClose();
  };

  const list = TEMPLATES.filter(t => t.kind === tab);
  return (
    <Modal title="Ejemplos y plantillas" informational wide onClose={onClose}>
      <div className="segmented help-tabs" role="tablist" aria-label="Ejemplos o plantillas">
        <button type="button" role="tab" aria-selected={tab === 'example'} onClick={() => setTab('example')}>
          <BookOpen size={14} aria-hidden />
          <span className="label">Ejemplos con datos</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'template'} onClick={() => setTab('template')}>
          <Layers size={14} aria-hidden />
          <span className="label">Plantillas de tipos</span>
        </button>
      </div>
      <p className="templates-intro">
        {tab === 'example'
          ? 'Cada ejemplo se abre como un proyecto tuyo: puedes cambiarlo, borrarlo o usarlo de base para el tuyo.'
          : 'Una plantilla trae tipos, atributos y relaciones, sin datos. Ábrela como proyecto nuevo o añade sus tipos al actual.'}
      </p>
      <div className="template-list">
        {list.map(t => (
          <article key={t.id} className="template-card">
            <div className="template-text">
              <h3>{t.name}</h3>
              <p>{t.summary}</p>
              {t.highlights.length > 0 && (
                <ul>
                  {t.highlights.map(h => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="template-actions">
              {t.id === 'cars' && (
                <Button size="sm" variant="primary" icon={Compass} onClick={() => open(t, true)}>
                  Abrir con recorrido guiado
                </Button>
              )}
              <Button size="sm" variant={t.id === 'cars' ? 'secondary' : 'primary'} icon={Plus} onClick={() => open(t)}>
                Abrir como proyecto nuevo
              </Button>
              {t.id !== 'empty' && (
                <Button size="sm" variant="ghost" onClick={() => merge(t)}>
                  Añadir sus tipos a «{project.name}»
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </Modal>
  );
}
