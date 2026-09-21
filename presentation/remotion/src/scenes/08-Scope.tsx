import {useCurrentFrame} from 'remotion';
import {Cloud, LockKeyhole, ShieldQuestion} from 'lucide-react';
import {Accent, At, Badge, C, Flow, Headline, Label, Panel, Stage, tween} from '../design';

export const Scope = () => {
  const f = useCurrentFrame();
  const second = f >= 99;
  return <Stage light chapter="08 / THE TARGET MATTERS" note="A mismatch or access denial is a visible evidence gap, not an invented infrastructure failure.">
    <Headline dark={false} size={104}>{second ? <>No access.<br /><Accent color="#AF4A31">Not enough evidence.</Accent></> : <>Right result.<br /><Accent color="#AF4A31">Wrong environment.</Accent></>}</Headline>
    <At x={240} y={416}><Panel w={545} h={343} light>
      <At x={40} y={32}><Label color={C.gray}>{second ? 'QUERY / ACCESS DENIED' : 'CHECKED / STAGING'}</Label></At>
      <At x={51} y={120}>{second ? <LockKeyhole size={93} color="#B25235" /> : <Cloud size={106} color={C.green} />}</At>
      <At x={203} y={130}><Badge color={second ? C.orange : C.teal} size={42}>{second ? '403' : 'PASS'}</Badge></At>
    </Panel></At>
    <Flow d="M820 575H1090" progress={second ? tween(f, 99, 125) : tween(f, 9, 55)} color="#B85539" width={7} />
    <At x={912} y={518}><div style={{fontSize: 100, fontWeight: 600, color: '#B25235', lineHeight: 1}}>≠</div></At>
    <At x={1130} y={416}><Panel w={545} h={343} light>
      <At x={40} y={32}><Label color={C.gray}>{second ? 'SERVICE HEALTH' : 'CLAIM / PRODUCTION'}</Label></At>
      <At x={51} y={125}><ShieldQuestion size={95} color="#B25235" /></At>
      <At x={195} y={149}><div style={{fontSize: 42, fontWeight: 700, color: '#A34830'}}>{second ? 'Unknown' : 'Unverified'}</div></At>
    </Panel></At>
  </Stage>;
};
