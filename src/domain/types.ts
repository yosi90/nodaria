export type FieldType =
  | 'text'
  | 'longText'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'nodeRef'
  | 'nodeRefs'
  | 'computed'
  | 'image'
  | 'gender'
  | 'url'
  | 'color'
  | 'scale'
  | 'tags';
export type SchemaKind = 'entity' | 'relationship';
export type RelationStyle = 'normal' | 'strong' | 'hidden';
export type FieldValue = string | number | boolean | string[] | null;

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  isTitle: boolean;
  description: string;
  defaultValue: FieldValue;
  options: string[];
  referenceTypeIds: string[];
  formula: string;
  /** Icono del atributo (catálogo de iconos), o ninguno. */
  icon: string | null;
  /** Icono de cada opción de una lista, por su texto. */
  optionIcons: Record<string, string>;
  /** Cómo se enseña en la tarjeta del nodo: nada, solo el icono, o icono y texto en una línea propia. */
  nodeDisplay: NodeDisplay;
  /** En una lista, cada opción puede sobrescribir `nodeDisplay`. */
  optionDisplay: Record<string, NodeDisplay>;
}
export type NodeDisplay = 'none' | 'icon' | 'text';
/** Vínculo a un atributo de la biblioteca compartida del proyecto. */
export interface FieldLink {
  ref: string;
}
/** Un tipo lista atributos propios y vínculos a compartidos, en el orden en que se muestran. */
export type SchemaField = FieldDefinition | FieldLink;
export interface Schema {
  id: string;
  name: string;
  kind: SchemaKind;
  isAbstract: boolean;
  parentTypeId: string | null;
  color: string;
  /** Nombre de un icono del catálogo de la interfaz; desconocido o vacío se muestra como genérico. */
  icon: string;
  description: string;
  fields: SchemaField[];
  allowedChildTypeIds: string[];
  sourceTypeIds: string[];
  targetTypeIds: string[];
  directed: boolean;
  relationStyle: RelationStyle;
  /** Una relación estructural puede usarse como jerarquía alternativa en el árbol y en la disposición. */
  structural: boolean;
  /** En una relación estructural, qué extremo es el superior (el "padre"). */
  parentEnd: 'source' | 'target';
  /** Nombre del tipo visto desde el destino («Venerado por» para «Venera a»); vacío = el mismo nombre. */
  inverseName: string;
  /** Dirigida y además recíproca: flecha en los dos extremos, con un papel por lado. */
  reciprocal: boolean;
  /** Sus relaciones eligen un parentesco del vocabulario del proyecto en lugar de un nombre libre. */
  genealogical: boolean;
}
/** Género de un nodo: masculino, femenino, neutro u otro, o sin definir. */
export type Gender = 'm' | 'f' | 'n' | '';
/** Término del vocabulario de parentesco de un proyecto. */
/** Papel que el árbol puede deducir de la ascendencia directa y que un término del vocabulario representa. */
export type DerivedRole = 'grandparent' | 'grandchild' | 'sibling' | 'uncle' | 'nephew' | 'cousin';
export interface KinshipTerm {
  id: string;
  neutral: string;
  masculine: string;
  feminine: string;
  /** Término que describe al otro extremo («Progenitor/a» ↔ «Hijo/a»). */
  counterpartId: string;
  /** +1 ascendiente, −1 descendiente, 0 misma generación (±2 abuelos, etc.). */
  generation: number;
  /** Ascendencia directa: estas relaciones forman el árbol genealógico. */
  lineage: boolean;
  /** Pareja: en la disposición genealógica los dos nodos se dibujan juntos, con sus hijos debajo. */
  couple: boolean;
  /** Si el árbol deduce este parentesco (abuelo = progenitor del progenitor, etc.), con qué papel. */
  derived: DerivedRole | null;
}
export type Position = { x: number; y: number };
/** Los valores de nodos y relaciones se indexan por `FieldDefinition.id`, no por su clave. */
export interface Node {
  id: string;
  typeId: string;
  parentId: string | null;
  values: Record<string, FieldValue>;
  createdAt: string;
  /** Posición fijada por el usuario en el lienzo; `null` deja que la disposición automática la coloque. */
  /** Posición fijada a mano en cada disposición del lienzo; sin entrada, se coloca automáticamente. */
  positions: Partial<Record<LayoutMode, Position>>;
  /** Texto libre con menciones `[[Nombre]]` a otros nodos. */
  notes: string;
}
export interface Relation {
  id: string;
  typeId: string;
  sourceId: string;
  targetId: string;
  values: Record<string, FieldValue>;
  createdAt: string;
  /** Papel del destino, cuando difiere del nombre propio («Sobrina» frente a «Tía»); vacío = no se distingue. */
  reverseName: string;
  /** En relaciones genealógicas, término de parentesco del origen respecto al destino. */
  kinshipId: string | null;
  /** Usar el nombre neutro del parentesco aunque los nodos tengan género. */
  kinshipNeutral: boolean;
}
export interface Project {
  /** Versión del formato de datos del proyecto; ver `src/services/migrations.ts`. */
  formatVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  schemas: Schema[];
  /** Atributos compartidos que los tipos vinculan en lugar de redefinir. */
  fieldLibrary: FieldDefinition[];
  nodes: Node[];
  relations: Relation[];
  /** Imagen de fondo de la disposición «Mapa», o ninguna. */
  mapImage: MapImage | null;
  view: ProjectView;
  /** Vistas guardadas del mapa. */
  lenses: Lens[];
  /** Vocabulario de parentesco para las relaciones genealógicas. */
  kinship: KinshipTerm[];
}
/** Una vista guardada: la configuración del mapa y, opcionalmente, las posiciones de los nodos. */
export interface Lens {
  id: string;
  name: string;
  view: ProjectView;
  positions: Record<string, Position> | null;
}
export type LayoutMode = 'tree' | 'genealogy' | 'force' | 'radial' | 'image';
/** Imagen de fondo de la disposición «Mapa» (data URL reducida) con su tamaño en píxeles del lienzo. */
export interface MapImage {
  data: string;
  width: number;
  height: number;
  /** Escala con la que se dibuja en el lienzo (×1 = su tamaño en píxeles). Los nodos no cambian de tamaño. */
  scale: number;
}
/** Lo que una disposición oculta: tipos de entidad, tipos de relación y atributos de referencia. */
export interface LayoutFilters {
  hiddenEntityTypeIds: string[];
  hiddenRelationTypeIds: string[];
  hiddenReferenceFieldIds: string[];
}
/** Estado de la vista del mapa. Se guarda con el proyecto pero no entra en el historial de deshacer. */
export interface ProjectView {
  /** `null` = jerarquía "Dentro de"; si no, id de un tipo de relación estructural. */
  structureId: string | null;
  layout: LayoutMode;
  hiddenRelationTypeIds: string[];
  hiddenEntityTypeIds: string[];
  /** Atributos de referencia que no se dibujan como vínculos en el lienzo. */
  hiddenReferenceFieldIds: string[];
  /** Filtros de las demás disposiciones (los de la activa son los tres anteriores); ver `src/domain/layoutFilters.ts`. */
  layoutFilters: Partial<Record<LayoutMode, LayoutFilters>>;
  /** Cuándo mostrar las etiquetas de las aristas. */
  edgeLabels: 'always' | 'hover' | 'never';
  /** Vista guardada activa; `null` cuando la configuración es libre. */
  lensId: string | null;
  showHierarchy: boolean;
  /** No dibujar «Dentro de» entre dos nodos que ya tienen una relación visible (la relación lo explica). */
  hierarchyOnlyIfUnrelated: boolean;
  /** Modo foco: saltos visibles alrededor del nodo seleccionado; 0 = desactivado. */
  focusDepth: number;
}
export interface AppState {
  version: 3;
  activeProjectId: string;
  projects: Project[];
}
export type Selection = { kind: 'node' | 'relation'; id: string } | null;
/** Qué hacer con los subnodos de otros tipos cuando se borran los nodos de su padre. */
export type OrphanStrategy = 'lift' | 'cascade';
