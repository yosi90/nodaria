import type { Schema } from '../../domain/types';
import { OptionList } from '../common/OptionList';
import { schemaOption } from '../common/options';
import { Popover } from '../common/Popover';
import { type Anchor } from '../common/anchor';

interface NodeTypeMenuProps {
  anchor: Anchor;
  schemas: Schema[];
  /** Nombre del padre, si el nodo se crea dentro de otro. */
  parentLabel?: string;
  onSelect: (schemaId: string) => void;
  onClose: () => void;
}

export function NodeTypeMenu({ anchor, schemas, parentLabel, onSelect, onClose }: NodeTypeMenuProps) {
  return (
    <Popover anchor={anchor} onClose={onClose} label="Elegir tipo de nodo">
      <OptionList
        title={parentLabel ? `Añadir dentro de ${parentLabel}` : 'Añadir nodo raíz'}
        options={schemas.map(schema => schemaOption(schema))}
        selected={[]}
        onPick={onSelect}
        emptyLabel={
          parentLabel
            ? 'Este tipo no admite subnodos. Configúralos en «Tipos y propiedades».'
            : 'Crea primero un tipo de entidad en «Tipos y propiedades».'
        }
      />
    </Popover>
  );
}
