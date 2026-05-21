'use client';

import { BlackHolePipeline } from './pipeline';

// Scene is now a single fullscreen raymarched + bloom-mip-chain pipeline (5
// passes, all in TSL). All visible output comes from the composite pass —
// there are no R3F scene children. The pipeline owns its own render loop
// and disables R3F's auto-render via useFrame priority.
export default function Scene() {
  return <BlackHolePipeline />;
}
