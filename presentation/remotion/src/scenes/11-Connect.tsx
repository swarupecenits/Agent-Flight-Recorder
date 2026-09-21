import {useCurrentFrame} from 'remotion';
import {ArrowDownToLine, Braces, Cable, Database, FileJson2, GitCompareArrows, Network} from 'lucide-react';
import {Accent, At, Badge, C, Flow, Headline, Mark, Panel, Pop, ProofShot, Stage, tween} from '../design';

export const Connect = () => {
  const f = useCurrentFrame();
  return <Stage chapter="11 / BRING YOUR OWN AGENT" note="Node SDK and Python/HTTP examples. MCP is read-only. Imports verify integrity; exports don't execute anything.">
    <Headline size={108}>Your agent.<br /><Accent>Your evidence trail.</Accent></Headline>
    <Pop x={127} y={420} delay={9}><Panel w={423} h={261}><At x={35} y={33}><Braces size={59} color={C.blue} /></At>
      <At x={32} y={123}><div style={{fontSize: 37, fontWeight: 700}}>SDK / HTTP</div><div style={{fontSize: 27, color: C.muted, marginTop: 17}}>Wrap real callbacks</div></At>
    </Panel></Pop>
    <Flow d="M560 550H815" progress={tween(f, 8, 53)} color={C.blue} />
    <At x={839} y={417}><div style={{width: 258, height: 265, borderRadius: 39, border: '3px solid #68807B', background: C.panel, display: 'flex', alignItems: 'center', flexDirection: 'column', justifyContent: 'center', gap: 22}}>
      <Mark size={91} /><div style={{fontSize: 25, fontFamily: 'Story Mono'}}>COLLECTOR</div>
    </div></At>
    <Flow d="M1116 550H1320" progress={tween(f, 47, 91)} />
    <Pop x={1350} y={421} delay={55}><Panel w={419} h={260}><At x={31} y={33}><Network size={60} color={C.teal} /></At>
      <At x={32} y={123}><div style={{fontSize: 37, fontWeight: 700}}>MCP / READ-ONLY</div><div style={{fontSize: 26, color: C.muted, marginTop: 17}}>Trace · replay · failures</div></At>
    </Panel></Pop>
    <At x={650 + ((f % 45) / 45) * 151} y={538} style={{opacity: tween(f, 47, 69)}}><Cable size={28} color={C.blue} /></At>
    <At x={1150 + ((f % 45) / 45) * 131} y={538} style={{opacity: tween(f, 72, 95)}}><Database size={28} color={C.teal} /></At>
    <ProofShot kind="connect" x={123} y={537} w={522} h={255} delay={116} focus="49% 75%" caption="INTEGRATION GUIDE / ACTUAL PRODUCT" />
    <Pop x={716} y={737} delay={110}><div style={{display: 'flex', gap: 14}}>
      <Badge color={C.cream} size={25}><FileJson2 size={28} />JSON</Badge>
      <Badge color={C.cream} size={25}><ArrowDownToLine size={28} />Markdown / OTLP</Badge>
      <Badge color={C.teal} size={25}><GitCompareArrows size={28} />Compare</Badge>
    </div></Pop>
  </Stage>;
};
