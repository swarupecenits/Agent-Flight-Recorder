import {useCurrentFrame} from 'remotion';
import {Accent, At, Badge, C, Flow, Headline, Label, Panel, Pop, Stage, Token, tween} from '../design';

export const Gap = () => {
  const f = useCurrentFrame();
  const edit = tween(f, 65, 108);
  return <Stage light chapter="02 / THE MISSING PROOF" note="A passing result for A cannot establish whether the delivered version B passes or fails.">
    <Headline dark={false} size={110}>The code moved on.<br /><Accent color="#B84B31">The proof didn't.</Accent></Headline>
    <Pop x={161} y={411} delay={12} rotate={-3}>
      <Panel w={535} h={347}>
        <At x={34} y={31}><Label color={C.teal}>CHECKED / VERSION A</Label></At>
        <At x={35} y={105}><div style={{fontFamily: 'Story Mono', fontSize: 33, color: C.muted}}>function add(a, b) {'{'}</div><div style={{fontFamily: 'Story Mono', fontSize: 39, color: C.lime, marginTop: 22}}> return a + b;</div><div style={{fontFamily: 'Story Mono', fontSize: 33, marginTop: 22}}>{'}'}</div></At>
      </Panel>
    </Pop>
    <Flow d="M720 576C900 575 938 575 1120 576" progress={tween(f, 36, 77)} color={C.gray} width={6} />
    <At x={795} y={495}><Label color="#A45036">EDIT</Label></At>
    <At x={781 + edit * 120} y={588 - Math.sin(edit * Math.PI) * 110} style={{rotate: `${-12 + edit * 18}deg`, scale: 1 - edit * .13, zIndex: 2}}><Token version="A" status={f > 135 ? 'unknown' : 'pass'} size={172} /></At>
    <Pop x={1130} y={411} delay={71} rotate={3}>
      <Panel w={579} h={347} light>
        <At x={34} y={31}><Label color="#A45036">DELIVERED / VERSION B</Label></At>
        <At x={35} y={107}><div style={{fontFamily: 'Story Mono', fontSize: 34}}>function add(a, b) {'{'}</div><div style={{fontFamily: 'Story Mono', fontSize: 36, color: '#A45036', marginTop: 22}}> return [a,b].reduce(...);</div></At>
        <At x={35} y={259}><Badge color={C.orange} size={26}>No new validation</Badge></At>
      </Panel>
    </Pop>
    <At x={761} y={774} style={{opacity: tween(f, 134, 154)}}><div style={{fontSize: 43, color: '#A45036', fontWeight: 700}}>Confidence is not evidence.</div></At>
  </Stage>;
};
