import { useState } from 'react';import { Topbar } from './components/layout/Topbar';import { MapView } from './components/map/MapView';import { SchemaView } from './components/schema/SchemaView';
export default function App(){const[view,setView]=useState<'map'|'schema'>('map');return <div className="app"><Topbar view={view} onView={setView}/>{view==='map'?<MapView/>:<SchemaView/>}</div>}
