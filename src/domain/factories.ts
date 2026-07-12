import { COLORS } from './constants';
import type { AppState, FieldDefinition, Project, Schema, SchemaKind } from './types';
export const uid = (prefix='id') => `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
export const now = () => new Date().toISOString();
export function createProject(name='Mi primer mapa'): Project { const stamp=now(); return {id:uid('project'),name,createdAt:stamp,updatedAt:stamp,schemas:[],nodes:[],relations:[]}; }
export function createInitialState(): AppState { const project=createProject(); return {version:2,activeProjectId:project.id,projects:[project]}; }
export function createSchema(name:string, kind:SchemaKind): Schema { return {id:uid('type'),name,kind,isAbstract:false,parentTypeId:null,color:COLORS[Math.floor(Math.random()*COLORS.length)],description:'',fields:[],allowedChildTypeIds:[],sourceTypeIds:[],targetTypeIds:[],directed:false,relationStyle:'normal'}; }
export function createField(): FieldDefinition { return {id:uid('field'),key:'nuevo_campo',label:'Nuevo campo',type:'text',required:false,isTitle:false,description:'',defaultValue:'',options:[],referenceTypeIds:[],formula:''}; }
