/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { createField, createProject, createSchema, now, uid } from '../domain/factories';
import { descendants } from '../domain/selectors';
import type { AppState, FieldValue, Project, Relation, Schema, SchemaKind } from '../domain/types';
import { loadState, saveState } from '../services/storage';

type Action =
 | {type:'set-project';id:string}|{type:'add-project';name:string}|{type:'rename-project';name:string}|{type:'delete-project'}|{type:'import-project';project:Project}
 | {type:'add-schema';name:string;kind:SchemaKind}|{type:'update-schema';schema:Schema}|{type:'delete-schema';id:string}|{type:'add-field';schemaId:string}|{type:'delete-field';schemaId:string;fieldId:string}
 | {type:'add-node';typeId:string;parentId:string|null}|{type:'update-node';id:string;values:Record<string,FieldValue>;parentId:string|null}|{type:'delete-node';id:string}
 | {type:'add-relation';typeId:string;sourceId:string;targetId:string}|{type:'update-relation';relation:Relation}|{type:'delete-relation';id:string};
const Context=createContext<{state:AppState;project:Project;dispatch:React.Dispatch<Action>}|null>(null);
function reducer(state:AppState,action:Action):AppState { const next=structuredClone(state); const p=next.projects.find(x=>x.id===next.activeProjectId)!;
  switch(action.type){
    case'set-project':next.activeProjectId=action.id;return next;
    case'add-project':{const n=createProject(action.name);next.projects.push(n);next.activeProjectId=n.id;return next;}
    case'rename-project':p.name=action.name;break;
    case'delete-project':next.projects=next.projects.filter(x=>x.id!==p.id);if(!next.projects.length)next.projects.push(createProject());next.activeProjectId=next.projects[0].id;return next;
    case'import-project':{let n=action.project;if(next.projects.some(x=>x.id===n.id))n={...n,id:uid('project')};next.projects.push(n);next.activeProjectId=n.id;return next;}
    case'add-schema':p.schemas.push(createSchema(action.name,action.kind));break;
    case'update-schema':p.schemas=p.schemas.map(x=>x.id===action.schema.id?action.schema:x);break;
    case'delete-schema':{const ids=new Set(p.nodes.filter(n=>n.typeId===action.id).map(n=>n.id));p.nodes=p.nodes.filter(n=>n.typeId!==action.id);p.relations=p.relations.filter(r=>r.typeId!==action.id&&!ids.has(r.sourceId)&&!ids.has(r.targetId));p.schemas=p.schemas.filter(s=>s.id!==action.id).map(s=>({...s,parentTypeId:s.parentTypeId===action.id?null:s.parentTypeId}));break;}
    case'add-field':{const s=p.schemas.find(x=>x.id===action.schemaId);if(s){const f=createField();let i=2;while(s.fields.some(x=>x.key===f.key))f.key=`nuevo_campo_${i++}`;s.fields.push(f);}break;}
    case'delete-field':{const s=p.schemas.find(x=>x.id===action.schemaId);if(s)s.fields=s.fields.filter(f=>f.id!==action.fieldId);break;}
    case'add-node':{const schema=p.schemas.find(s=>s.id===action.typeId);const values:Record<string,FieldValue>={};schema?.fields.forEach(f=>{if(f.defaultValue!==''&&f.type!=='computed')values[f.key]=f.defaultValue});p.nodes.push({id:uid('node'),typeId:action.typeId,parentId:action.parentId,values,createdAt:now()});break;}
    case'update-node':{const n=p.nodes.find(x=>x.id===action.id);if(n){n.values=action.values;n.parentId=action.parentId;}break;}
    case'delete-node':{const ids=descendants(p,action.id);p.nodes=p.nodes.filter(n=>!ids.has(n.id));p.relations=p.relations.filter(r=>!ids.has(r.sourceId)&&!ids.has(r.targetId));break;}
    case'add-relation':p.relations.push({id:uid('rel'),typeId:action.typeId,sourceId:action.sourceId,targetId:action.targetId,values:{},createdAt:now()});break;
    case'update-relation':p.relations=p.relations.map(r=>r.id===action.relation.id?action.relation:r);break;
    case'delete-relation':p.relations=p.relations.filter(r=>r.id!==action.id);break;
  }
  p.updatedAt=now();return next;
}
export function AppProvider({children}:{children:ReactNode}) { const [state,dispatch]=useReducer(reducer,undefined,loadState);useEffect(()=>saveState(state),[state]);const project=state.projects.find(p=>p.id===state.activeProjectId)??state.projects[0];const value=useMemo(()=>({state,project,dispatch}),[state,project]);return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useApp(){const value=useContext(Context);if(!value)throw new Error('useApp debe usarse dentro de AppProvider');return value;}
