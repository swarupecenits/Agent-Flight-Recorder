import {AbsoluteFill, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';
import {TransitionSeries} from '@remotion/transitions';
import {Captions} from './Captions';
import {C} from './design';
import {Launch} from './scenes/01-Launch';
import {Gap} from './scenes/02-Gap';
import {Capture} from './scenes/03-Capture';
import {Replay} from './scenes/04-Replay';
import {Approval} from './scenes/05-Approval';
import {Insights} from './scenes/06-Insights';
import {Verdict} from './scenes/07-Verdict';
import {Scope} from './scenes/08-Scope';
import {Manifest} from './scenes/09-Manifest';
import {Recovery} from './scenes/10-Recovery';
import {Connect} from './scenes/11-Connect';
import {Desktop} from './scenes/12-Desktop';
import {Azure} from './scenes/13-Azure';
import {Ending} from './scenes/14-Ending';

const RibbonTransition = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{overflow: 'hidden', pointerEvents: 'none'}}>
    <div style={{position: 'absolute', width: 2460, height: 1600, top: -260, left: 0, background: C.coral, rotate: '-12deg',
      translate: interpolate(frame, [0, 7, 14], ['-2600px 0px', '-270px 0px', '2200px 0px'], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
      <div style={{position: 'absolute', left: 550, top: 0, width: 490, height: '100%', background: C.lime}} />
      <div style={{position: 'absolute', left: 1220, top: 0, width: 75, height: '100%', background: C.ink}} />
    </div>
  </AbsoluteFill>;
};

export const FlightStory = () => {
  const f = useCurrentFrame();
  return <AbsoluteFill data-story-frame={f} style={{background: C.ink}}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="01 Maya is about to ship" durationInFrames={240}><Launch /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="02 An old test meets new code" durationInFrames={270}><Gap /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="03 Agent flight recorder" durationInFrames={270}><Capture /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="04 Rewind without rerunning" durationInFrames={270}><Replay /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="05 Human approval and boundaries" durationInFrames={240}><Approval /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="06 Find the source" durationInFrames={210}><Insights /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="07 Four honest verdicts" durationInFrames={360}><Verdict /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="08 Version and target" durationInFrames={210}><Scope /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="09 Manifest and handoff" durationInFrames={240}><Manifest /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="10 Reviewed recovery and comparison" durationInFrames={300}><Recovery /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="11 SDK and public integrations" durationInFrames={240}><Connect /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="12 Local encrypted control" durationInFrames={300}><Desktop /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="13 Azure drafts not verdicts" durationInFrames={240}><Azure /></TransitionSeries.Sequence>
      <TransitionSeries.Overlay durationInFrames={14}><RibbonTransition /></TransitionSeries.Overlay>
      <TransitionSeries.Sequence name="14 Evidence not promises" durationInFrames={210}><Ending /></TransitionSeries.Sequence>
    </TransitionSeries>
    <Audio src={staticFile('master.wav')} />
    <Captions />
    <div style={{position: 'absolute', bottom: 19, height: 4, left: 112, right: 112, background: '#68857D40'}}>
      <div style={{height: 4, width: `${f / 3599 * 100}%`, background: C.coral}} />
    </div>
    <AbsoluteFill style={{pointerEvents: 'none', background: C.ink, zIndex: 40,
      opacity: interpolate(f, [3587, 3599], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}} />
  </AbsoluteFill>;
};
