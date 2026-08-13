// TODO: Full implementation in Phase 2
import { redirect } from "react-router";
export async function loader() { return {}; }
export default function Stub() {
  return <div style={{padding:'80px 28px',textAlign:'center',fontFamily:'var(--font-sans)',color:'var(--forest)'}}>
    <p style={{color:'var(--gold-dark)',fontSize:'12px',letterSpacing:'0.2em',textTransform:'uppercase',marginBottom:'16px'}}>Coming soon</p>
    <h1 style={{fontFamily:'var(--font-serif)',fontSize:'36px',fontWeight:500,color:'var(--forest-deep)'}}>Terms</h1>
  </div>;
}
