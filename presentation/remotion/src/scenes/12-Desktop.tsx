import {useCurrentFrame} from 'remotion';
import {Check, FilePenLine, Fingerprint, LockKeyhole, SlidersHorizontal, Terminal, Trash2} from 'lucide-react';
import {Accent, At, Badge, C, Flow, Headline, Label, Panel, Pop, Stage, tween} from '../design';

export const Desktop = () => {
  const f = useCurrentFrame();
  const privacy = f > 144;
  const paper = f > 219;
  return <Stage light={paper} chapter="12 / THE LOCAL VS CODE COMPANION" note="Encryption applies to the VS Code vault only. Browser Lens is memory-only; original SQLite remains plaintext.">
    <Headline size={100} dark={!paper}>Your workspace.<br /><Accent color={paper ? '#AB4B32' : C.lime}>Your choices.</Accent></Headline>
    <At x={124} y={382}><Panel w={725} h={398} light={paper}>
      <At x={31} y={26}><Label color={paper ? C.gray : C.muted}>{privacy ? 'REVIEW BEFORE CHANGING' : 'CAPTURE A TASK YOU CHOOSE'}</Label></At>
      {privacy ? <>
        <At x={34} y={99}><div style={{display: 'flex', alignItems: 'center', gap: 20, fontSize: 31}}><FilePenLine color={paper ? C.green : C.teal} />Scoped instruction proposal</div></At>
        <At x={34} y={165}><div style={{display: 'flex', alignItems: 'center', gap: 20, fontSize: 31}}><Trash2 color={paper ? '#A95334' : C.orange} />Content minimization + retention</div></At>
        <At x={34} y={231}><div style={{display: 'flex', alignItems: 'center', gap: 20, fontSize: 31}}><SlidersHorizontal color={paper ? C.gray : C.blue} />Theme · spacing · text · motion</div></At>
        <At x={37} y={318}><Badge color={C.teal} size={23}>No silent edits, exports or deletion</Badge></At>
      </> : <>
        <At x={39} y={98}><Terminal size={42} color={C.teal} /></At>
        <At x={108} y={103}><div style={{fontFamily: 'Story Mono', fontSize: 39}}>npm test</div></At>
        <At x={38} y={181}><div style={{fontSize: 29, color: C.muted, display: 'flex', gap: 17}}><Fingerprint />Before / after version fingerprints</div></At>
        <At x={38} y={257}><Badge color={C.teal} size={26}><Check />Observed exit status</Badge></At>
      </>}
    </Panel></At>
    <Flow d="M881 572H1187" progress={tween(f, 14, 70)} color={paper ? C.green : C.teal} />
    <Pop x={1204} y={372} delay={15}>
      <div style={{width: 481, height: 421, borderRadius: 42, background: paper ? '#204239' : '#DDF28B', border: `9px solid ${paper ? C.green : '#8A9D52'}`, boxShadow: '12px 17px 0 #061F2235', color: paper ? C.cream : C.ink}}>
        <At x={23} y={23}><div style={{width: 416, height: 357, border: `2px solid ${paper ? '#729A84' : '#8A9D52'}`, borderRadius: 23}} /></At>
        <At x={173} y={54}><LockKeyhole size={100} strokeWidth={1.8} /></At>
        <At x={53} y={191}><div style={{fontSize: 39, fontWeight: 700}}>ENCRYPTED VAULT</div></At>
        <At x={69} y={259}><div style={{fontSize: 29, lineHeight: 1.4, textAlign: 'center'}}>Records + review notes<br />SecretStorage key</div></At>
        {[82, 280].map(y => <At key={y} x={-18} y={y}><div style={{width: 28, height: 50, borderRadius: 8, background: '#7E954E'}} /></At>)}
      </div>
    </Pop>
    <At x={1017} y={487} style={{rotate: `${tween(f, 55, 99, -90, 0)}deg`, opacity: tween(f, 40, 60)}}><LockKeyhole color={paper ? C.green : C.teal} size={54} /></At>
    <At x={889} y={688} style={{opacity: tween(f, 164, 183)}}>
      <Label color={paper ? C.gray : C.muted} size={19}>THEME</Label>
      <div style={{display: 'flex', gap: 13, marginTop: 16}}>{[C.ink, C.paper].map((color, i) => <div key={color} style={{width: 49, height: 49, background: color, borderRadius: '50%', border: `4px solid ${(paper ? 1 : 0) === i ? C.coral : '#8A9C91'}`}} />)}</div>
    </At>
  </Stage>;
};
