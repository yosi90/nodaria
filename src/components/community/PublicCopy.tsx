import { useEffect, useRef } from 'react';
import { uid } from '../../domain/factories';
import { fetchPublic } from '../../services/community';
import { parseProject } from '../../services/storage';
import { useApp } from '../../state/AppContext';
import { useToast } from '../common/toasts';

/**
 * «Hacer una copia» de un proyecto público: la página pública manda aquí con `?copiar=<id>` y la copia entra
 * como un proyecto propio e independiente, con un id nuevo. Solo si quien lo publicó lo permite.
 */
export function PublicCopy() {
  const { dispatch } = useApp();
  const toast = useToast();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const params = new URLSearchParams(window.location.search);
    const publicId = params.get('copiar');
    if (!publicId) return;
    params.delete('copiar');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    fetchPublic(publicId).then(
      publication => {
        if (!publication.allowCopy) {
          toast({ message: 'Quien publicó este proyecto no permite hacer copias.' });
          return;
        }
        const { project } = parseProject(JSON.stringify(publication.document));
        dispatch({
          type: 'import-project',
          project: { ...project, id: uid('project'), name: `${publication.name} (copia)`.slice(0, 200) },
          replaceBlank: true,
        });
        toast({ message: `La copia de «${publication.name}» está en tus proyectos.` });
      },
      () => toast({ message: 'No se ha podido copiar: el proyecto ya no es público.' }),
    );
  }, [dispatch, toast]);

  return null;
}
