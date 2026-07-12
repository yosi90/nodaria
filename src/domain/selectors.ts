import type { FieldDefinition, Node, Project, Schema } from './types';
export const getSchema = (p:Project,id:string) => p.schemas.find(x=>x.id===id);
export function inheritedSchemas(p:Project,typeId:string) { const chain:Schema[]=[]; const seen=new Set<string>(); let cur=getSchema(p,typeId); while(cur&&!seen.has(cur.id)){seen.add(cur.id);chain.unshift(cur);cur=cur.parentTypeId?getSchema(p,cur.parentTypeId):undefined;} return chain; }
export function allFields(p:Project,typeId:string) { const fields=new Map<string,FieldDefinition>(); inheritedSchemas(p,typeId).forEach(s=>s.fields.forEach(f=>fields.set(f.key,f))); return [...fields.values()]; }
export function typeMatches(p:Project,typeId:string,allowed:string[]) { if(!allowed.length)return true; return allowed.some(id=>inheritedSchemas(p,typeId).some(s=>s.id===id)); }
export function nodeLabel(p:Project,n:Node) { const title=allFields(p,n.typeId).find(f=>f.isTitle); const value=title?n.values[title.key]:undefined; return String(value||getSchema(p,n.typeId)?.name||'Nodo'); }
export function fieldValue(field:FieldDefinition, values:Record<string,unknown>) { if(field.type!=='computed')return values[field.key]; return field.formula.replace(/\{([^}]+)\}/g,(_,key)=>String(values[key]??'')); }
export function descendants(p:Project,id:string) { const result=new Set([id]); let changed=true; while(changed){changed=false;p.nodes.forEach(n=>{if(n.parentId&&result.has(n.parentId)&&!result.has(n.id)){result.add(n.id);changed=true;}});} return result; }
