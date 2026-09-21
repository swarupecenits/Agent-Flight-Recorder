import {useCurrentFrame} from 'remotion';
import {ArrowUpRight, Clock, RotateCcw, ShieldCheck, TriangleAlert} from 'lucide-react';
import {Accent, At, C, Flow, Headline, Label, Pop, ProofShot, Stage, tween} from '../design';

export const Insights = () => {
  const f = useCurrentFrame();
  const rows = [
    {name: 'Failures', color: '#B94C3D', Icon: TriangleAlert, width: 365},
    {name: 'Retries', color: '#9D602D', Icon: RotateCcw, width: 545},
    {name: 'Slow tools', color: '#3E6E74', Icon: Clock, width: 433},
    {name: 'Approval waits', color: '#466635', Icon: ShieldCheck, width: 615},
  ];
  return <Stage light chapter="06 / THE SIGNAL IN THE NOISE" note="Illustrative diagnostic bars, not benchmark data. Actual findings link to the recorded runs.">
    <Headline dark={false} size={111}>Don't hunt through logs.<br /><Accent color="#B84F32">Find the turning point.</Accent></Headline>
    {rows.map(({name, color, Icon, width}, i) => <Pop x={119} y={390 + i * 108} delay={i * 13} key={name}>
      <div style={{display: 'flex', alignItems: 'center', gap: 20, fontSize: 35, fontWeight: 600}}><Icon size={35} color={color} />{name}</div>
      <div style={{height: 16, width: width * tween(f, 8 + i * 13, 69 + i * 13), background: color, borderRadius: 8, marginTop: 12}} />
    </Pop>)}
    <Flow d="M780 585C894 585 861 473 1004 473" progress={tween(f, 31, 105)} color={C.gray} />
    <At x={1026} y={374}><Label color={C.gray}>A FINDING WITH A SOURCE</Label></At>
    <ProofShot kind="insights" x={1010} y={431} w={760} h={337} delay={38} focus="37% 64%" caption="FAILURE & PERFORMANCE INSIGHTS" />
    <At x={1546} y={382} style={{scale: 1 + Math.sin(f / 14) * .08}}><ArrowUpRight size={50} color="#A44832" /></At>
  </Stage>;
};
