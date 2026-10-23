// Shared browser/Node wall-clock conversion; never uses device-local Date getters.
(function(root){
 const zone='Australia/Adelaide',formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 function adelaideInput(value){const parts=formatter.formatToParts(new Date(value)),get=k=>parts.find(p=>p.type===k)?.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;}
 function adelaideCandidates(wall){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wall||''))return [];const ms=Date.parse(wall+':00Z');return [630,570].map(offset=>ms-offset*60000).filter(ms=>Number.isFinite(ms)&&adelaideInput(ms)===wall).sort((a,b)=>a-b).map(ms=>new Date(ms).toISOString());}
 function adelaideInstant(wall,occurrence=''){const values=adelaideCandidates(wall);if(!values.length)throw Error('This Adelaide time does not exist. Check the date and daylight-saving change.');if(values.length>1&&!['earlier','later'].includes(occurrence))throw Error('This Adelaide time occurs twice. Choose the earlier (ACDT) or later (ACST) occurrence.');return values[occurrence==='later'?values.length-1:0];}
 const api={adelaideInput,adelaideCandidates,adelaideInstant};root.FrenchyObservationTime=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
