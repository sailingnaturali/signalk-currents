// One-shot: resolve a known gate's id from IWLS, then fetch its events from the
// plugin's api-sine endpoint with that same id. If api-sine returns rows, the two
// APIs share the id namespace and the plugin's existing chs.ts needs no change.
const IWLS = "https://api-iwls.dfo-mpo.gc.ca/api/v1";
const SINE = "https://api-sine.dfo-mpo.gc.ca/api/v1";

const stations = await (await fetch(`${IWLS}/stations`)).json();
const dodd = stations.find((s) => s.officialName === "Dodd Narrows");
if (!dodd) throw new Error("Dodd Narrows not in IWLS index");
console.log("IWLS id:", dodd.id);

const from = new Date();
const to = new Date(from.getTime() + 2 * 86400000);
const params = new URLSearchParams({
  "time-series-code": "wcp1-events",
  from: from.toISOString().replace(/\.\d{3}Z$/, "Z"),
  to: to.toISOString().replace(/\.\d{3}Z$/, "Z"),
});
const resp = await fetch(`${SINE}/stations/${dodd.id}/data?${params}`);
console.log("api-sine status:", resp.status);
const rows = resp.ok ? await resp.json() : [];
console.log("api-sine rows:", Array.isArray(rows) ? rows.length : rows);
console.log(rows.length > 0 ? "PASS: shared id namespace" : "FAIL: ids differ — move event fetch to IWLS");
