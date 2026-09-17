"use strict";
const $=id=>document.getElementById(id);
const evoBtn=$("evoBtn"),obsBtn=$("obsBtn"),evo=$("evo"),obs=$("obs");
function select(which){
 const isE=which==="evo";
 evo.hidden=!isE; obs.hidden=isE;
 evoBtn.classList.toggle("active",isE); obsBtn.classList.toggle("active",!isE);
}
evoBtn.onclick=()=>select("evo");
obsBtn.onclick=()=>select("obs");
$("reload").onclick=()=>{
 const f=$("arpaeFrame"); const u=f.src; f.src="about:blank";
 setTimeout(()=>f.src=u.split("?")[0]+"?t="+Date.now(),80);
};
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
