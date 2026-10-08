// OPTIONAL k6 script: run only against your authorized staging/CDN.
// This is an HTTP asset test, not a browser/GPU or 100,000-player validation.
import http from 'k6/http';import {check,sleep} from 'k6';
const base=String(__ENV.AERO_LOAD_URL||'').replace(/\/+$/,'');
if(!/^https?:\/\//.test(base))throw Error('Set AERO_LOAD_URL to your staging website root or project subpath');
export const options={
 scenarios:{visitors:{executor:'ramping-vus',startVUs:1,stages:[{duration:'30s',target:10},{duration:'60s',target:100},{duration:'15s',target:0}],gracefulRampDown:'10s'}},
 // Example targets; adjust to your agreed service budget, not a claimed SLA.
 thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<1500']},
 discardResponseBodies:true,
};
export default function(){
 const assets=['','game.bundle.js','assets/style.css','config.js'];
 if(__ENV.AERO_FULL==='1')assets.push('renderer3d.bundle.js');
 if(__ENV.AERO_WATER==='1')assets.push('assets/reef-training.webp');
 const responses=http.batch(assets.map(p=>['GET',base+'/'+p,null,{tags:{asset:p||'index'}}]));
 for(const response of responses)check(response,{'asset responds 200':r=>r.status===200});
 sleep(1);
}
