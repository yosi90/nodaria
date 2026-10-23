import { Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  answerFriendRequest,
  friendRequests,
  peopleList,
  searchPeople,
  socialErrorMessage,
  withdrawFriendRequest,
  type FriendRequest,
  type PeopleList,
  type Person,
} from '../../services/community';
import { Button } from '../common/Button';
import { useToast } from '../common/toasts';
import { useLoad, when } from './communityHelpers';
import { PersonChip } from './parts';
import { RelationActions } from './RelationActions';

type Section = 'solicitudes' | PeopleList;

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'solicitudes', label: 'Solicitudes' },
  { id: 'amistades', label: 'Amistades' },
  { id: 'seguidos', label: 'Siguiendo' },
  { id: 'seguidores', label: 'Seguidores' },
  { id: 'bloqueos', label: 'Bloqueadas' },
];

/**
 * «Personas»: buscar a alguien por su alias o su nombre, y tus solicitudes de amistad, amistades, seguidos,
 * seguidores y bloqueos, todo de la plataforma. Cada persona lleva sus acciones (seguir, amistad, mensaje).
 */
export function PeopleTab() {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<Section>('solicitudes');
  const searching = query.trim().length >= 2;

  return (
    <div className="community-page">
      <header className="community-page-head">
        <h2>Personas</h2>
        <p className="muted-note">
          Las amistades y los seguidos son los de tu cuenta de Yosiftware, en todas sus webs.
        </p>
        <label className="community-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder="Buscar por alias o nombre"
            aria-label="Buscar personas"
            onChange={e => setQuery(e.target.value)}
          />
        </label>
      </header>
      {searching ? (
        <SearchResults query={query.trim()} />
      ) : (
        <>
          <div className="segmented community-tabs" role="tablist">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={section === s.id}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {section === 'solicitudes' ? <Requests /> : <PeopleListView key={section} list={section} />}
        </>
      )}
    </div>
  );
}

function PersonRow({ person, detail, onChange }: { person: Person; detail?: string; onChange?: () => void }) {
  return (
    <li className="person-row">
      <PersonChip person={person} size={40} />
      {detail && <span className="muted person-row-detail">{detail}</span>}
      <RelationActions person={person} compact onChange={onChange} />
    </li>
  );
}

function SearchResults({ query }: { query: string }) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const load = useCallback(() => searchPeople(debounced), [debounced]);
  const { value, error } = useLoad(load);
  if (error) return <p className="group-error">{error}</p>;
  if (!value) return <p className="muted-note">Buscando…</p>;
  if (!value.length)
    return <p className="muted-note">Nadie coincide. Los perfiles privados solo salen por su alias exacto.</p>;
  return (
    <ul className="person-list">
      {value.map(person => (
        <PersonRow key={person.id} person={person} />
      ))}
    </ul>
  );
}

function PeopleListView({ list }: { list: PeopleList }) {
  const load = useCallback(() => peopleList(list), [list]);
  const { value, setValue, error, reload } = useLoad(load);
  const [more, setMore] = useState(false);
  if (error) return <p className="group-error">{error}</p>;
  if (!value) return <p className="muted-note">Cargando…</p>;
  if (!value.vinculos.length)
    return (
      <p className="muted-note">
        {list === 'amistades'
          ? 'Aún no tienes amistades.'
          : list === 'seguidos'
            ? 'Aún no sigues a nadie.'
            : list === 'seguidores'
              ? 'Aún no te sigue nadie.'
              : 'No has bloqueado a nadie.'}
      </p>
    );
  const loadMore = async () => {
    setMore(true);
    try {
      const next = await peopleList(list, value.cursor);
      setValue({ vinculos: [...value.vinculos, ...next.vinculos], cursor: next.cursor });
    } finally {
      setMore(false);
    }
  };
  return (
    <>
      <ul className="person-list">
        {value.vinculos.map(link => (
          <PersonRow
            key={link.persona.id}
            person={link.persona}
            detail={`Desde el ${when(link.desde)}`}
            onChange={list === 'bloqueos' ? reload : undefined}
          />
        ))}
      </ul>
      {value.cursor && (
        <Button size="sm" disabled={more} onClick={() => void loadMore()}>
          {more ? 'Cargando…' : 'Ver más'}
        </Button>
      )}
    </>
  );
}

function Requests() {
  const toast = useToast();
  const loadReceived = useCallback(() => friendRequests('recibidas'), []);
  const received = useLoad(loadReceived);
  const loadSent = useCallback(() => friendRequests('enviadas'), []);
  const sent = useLoad(loadSent);
  const act = async (work: () => Promise<void>, done: () => void, message: string) => {
    try {
      await work();
      done();
      toast({ message });
    } catch (error) {
      toast({ message: socialErrorMessage(error) });
    }
  };
  const drop = (list: typeof received, request: FriendRequest) =>
    list.setValue((list.value ?? []).filter(r => r.id !== request.id));

  return (
    <div className="community-columns">
      <section>
        <h3>Recibidas</h3>
        {received.error && <p className="group-error">{received.error}</p>}
        {received.value && !received.value.length && <p className="muted-note">No tienes solicitudes pendientes.</p>}
        <ul className="person-list">
          {received.value?.map(request => (
            <li key={request.id} className="person-row">
              <PersonChip person={request.persona} size={40} />
              <span className="muted person-row-detail">{when(request.creada)}</span>
              <div className="relation-actions">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    void act(
                      () => answerFriendRequest(request.id, true),
                      () => drop(received, request),
                      'Ahora sois amistades',
                    )
                  }
                >
                  Aceptar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void act(
                      () => answerFriendRequest(request.id, false),
                      () => drop(received, request),
                      'Solicitud rechazada',
                    )
                  }
                >
                  Rechazar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Enviadas</h3>
        {sent.error && <p className="group-error">{sent.error}</p>}
        {sent.value && !sent.value.length && <p className="muted-note">No tienes solicitudes enviadas pendientes.</p>}
        <ul className="person-list">
          {sent.value?.map(request => (
            <li key={request.id} className="person-row">
              <PersonChip person={request.persona} size={40} />
              <span className="muted person-row-detail">Caduca el {when(request.caduca)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void act(
                    () => withdrawFriendRequest(request.id),
                    () => drop(sent, request),
                    'Solicitud retirada',
                  )
                }
              >
                Retirar
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
