import type {Caption} from '@remotion/captions';
import {useCurrentFrame} from 'remotion';
import captions from './captions.generated.json';
import {C} from './design';

export const Captions = () => {
  const frame = useCurrentFrame();
  const time = frame / 30 * 1000;
  const cue: Caption | undefined = captions.find(value => value.startMs <= time && value.endMs > time);
  if (!cue) return null;
  return <div data-caption style={{position: 'absolute', bottom: 46, left: 133, right: 133, display: 'flex', justifyContent: 'center',
    fontFamily: 'Story Sans', fontSize: 35, textAlign: 'center', zIndex: 30, lineHeight: 1.27}}>
    <div style={{background: '#091920F2', padding: '13px 28px 16px', borderRadius: 18, color: C.cream, boxShadow: '0 5px 18px #0003',
      maxWidth: 1654, border: '1px solid #56716855'}}>{cue.text}</div>
  </div>;
};
