import {useCurrentFrame} from 'remotion';
import {Accent, At, Badge, Bot, C, Cursor, Headline, Label, Maya, Panel, Pop, Sparkles, Stage, tween} from '../design';

export const Launch = () => {
  const f = useCurrentFrame();
  return <Stage chapter="01 / THE QUESTION" note="Maya is a fictional developer. This story illustrates the working prototype.">
    <Headline size={104} width={1460}>Three words before launch.</Headline>
    <At x={210} y={355}><Maya size={420} /></At>
    <At x={699} y={369}><Bot size={243} /></At>
    <Pop x={1010} y={341} delay={12}>
      <Panel w={700} h={210} light>
        <At x={30} y={24}><Label color={C.gray}>AGENT SAYS</Label></At>
        <At x={30} y={76}><div style={{fontSize: 73, fontWeight: 700, letterSpacing: -3}}>All tests pass.</div></At>
        <At x={42} y={192}><div style={{width: 38, height: 38, background: C.cream, rotate: '45deg'}} /></At>
      </Panel>
    </Pop>
    <Pop x={1142} y={627} delay={42}><Badge size={45}>SHIP THE CHANGE →</Badge></Pop>
    <Cursor x={tween(f, 35, 83, 1660, 1534)} y={tween(f, 35, 83, 814, 673)} />
    <Pop x={846} y={747} delay={101}><div style={{fontSize: 53, fontWeight: 600, rotate: '-3deg'}}><Accent color={C.coral}>Wait.</Accent> Where is the proof?</div></Pop>
    <Sparkles x={1540} y={658} start={85} color={C.coral} amount={6} />
  </Stage>;
};
