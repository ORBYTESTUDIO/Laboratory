// Nebula flight by Orblivius

#define PASS_COUNT       1
#define SPIRAL_NOISE_ITER 6

// ── Star tunnel ───────────────────────────────────────────────────────────────
float fBrightness   = 2.;
float fSteps        = 121.0;
float fParticleSize = 0.015;
float fParticleLength = 0.5/60.0;
float fMinDist      = 0.8;
float fMaxDist      = 5.0;
float fRepeatMin    = 1.0;
float fRepeatMax    = 2.0;
float fDepthFade    = 0.5;

float Random(float x) {
    return fract(sin(x*123.456)*23.4567 + sin(x*345.678)*45.6789 + sin(x*456.789)*56.789);
}

vec3 GetParticleColour(vec3 vParticlePos, float fParticleSize, vec3 vRayDir) {
    vec2 vNormDir   = normalize(vRayDir.xy);
    float d1        = dot(vParticlePos.xy, vNormDir) / length(vRayDir.xy);
    vec3 vClosest2d = vRayDir * d1;
    vec3 vClampedPos = vParticlePos;
    vClampedPos.z   = clamp(vClosest2d.z, vParticlePos.z - fParticleLength, vParticlePos.z + fParticleLength);
    float d         = dot(vClampedPos, vRayDir);
    vec3 vDeltaPos  = vClampedPos - vRayDir * d;
    float fShade    = clamp(1.0 - length(vDeltaPos)/fParticleSize, 0., 1.);
    fShade          = fShade * exp2(-d * fDepthFade) * fBrightness;
    return vec3(fShade);
}

vec3 GetParticlePos(vec3 vRayDir, float fZPos, float fSeed) {
    float fAngle         = atan(vRayDir.x, vRayDir.y);
    float fAngleFraction = fract(fAngle / (3.14*2.0));
    float fSegment       = floor(fAngleFraction * fSteps + fSeed) + 0.5 - fSeed;
    float fParticleAngle = fSegment / fSteps * (3.14*2.0);
    float fSegmentPos    = fSegment / fSteps;
    float fRadius        = fMinDist + Random(fSegmentPos + fSeed) * (fMaxDist - fMinDist);
    float tunnelZ        = vRayDir.z / length(vRayDir.xy / fRadius) + fZPos;
    float fRepeat        = fRepeatMin + Random(fSegmentPos + 0.1 + fSeed) * (fRepeatMax - fRepeatMin);
    float fParticleZ     = (ceil(tunnelZ / fRepeat) - 0.5) * fRepeat - fZPos;
    return vec3(sin(fParticleAngle)*fRadius, cos(fParticleAngle)*fRadius, fParticleZ);
}

vec3 Starfield(vec3 vRayDir, float fZPos, float fSeed) {
    return GetParticleColour(GetParticlePos(vRayDir, fZPos, fSeed), fParticleSize, vRayDir);
}

vec3 RotateX(vec3 p, float a) { float s=sin(a),c=cos(a); return vec3(p.x, c*p.y+s*p.z, -s*p.y+c*p.z); }
vec3 RotateY(vec3 p, float a) { float s=sin(a),c=cos(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
vec3 RotateZ(vec3 p, float a) { float s=sin(a),c=cos(a); return vec3(c*p.x+s*p.y, -s*p.x+c*p.y, p.z); }

// ── Hash / noise for clouds ───────────────────────────────────────────────────
float h1(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
float hash(vec3 p){ p=fract(p*.1031); p+=dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }

float vn(vec3 p) {
    vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(mix(h1(i),           h1(i+vec3(1,0,0)),f.x),
                   mix(h1(i+vec3(0,1,0)),h1(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h1(i+vec3(0,0,1)),h1(i+vec3(1,0,1)),f.x),
                   mix(h1(i+vec3(0,1,1)),h1(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float pn(vec3 p) { return 2.4*vn(p)-1.; }
float hash(float p) { vec3 p3=fract(vec3(p)*.1031); p3+=dot(p3,p3.yzx+19.19); return fract((p3.x+p3.y)*p3.z); }
// ── Spiral noise + cloud map (verbatim from original) ─────────────────────────
const float nudge = 20.;
float normalizer  = 1./sqrt(1.+nudge*nudge);

float SpiralNoiseC(vec3 p, vec4 id) {
    float iter=2., n=2.-id.x;
    for (int i=0; i<SPIRAL_NOISE_ITER; i++) {
    n += -abs(sin(.3*iTime+p.y*iter)+cos(p.x*iter))/iter;
       // n += -abs(sin(p.y*iter)+cos(p.x*iter))/iter;
        p.xy += vec2(p.y,-p.x)*nudge; p.xy *= normalizer;
        p.xz += vec2(p.z,-p.x)*nudge; p.xz *= normalizer;
        iter *= id.y+.733733;
    }
    return n;
}

float mapIntergalacticCloud(vec3 p, vec4 id) {
    float k = 2.*id.w+.1;
    return k*(.5 + SpiralNoiseC(p.zxy*.4132+333.,id)*3. + pn(p*8.5)*.12);
}

// ── Cloud renderer (verbatim from original) ───────────────────────────────────
vec3 hsv2rgb(float x, float y, float z) {
    return z+z*y*(clamp(abs(mod(x*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.)-1.);
}

vec4 renderIntergalacticClouds(vec3 ro, vec3 rd, float tmax, vec4 id) {
    float max_dist = min(tmax, 22.),
          td=0., d, t, noi, lDist, a, sp=9.,
          rRef=2.*id.x,
          h=.05+.25*id.z;
    vec3 pos, lightColor;
    vec4 sum = vec4(0);

    t = .1*hash(hash(rd));
    for (int i=0; i<100; i++) {
        if (td>.9 || sum.a>.99 || t>max_dist) break;
        a   = smoothstep(max_dist, 0., t);
        pos = ro + t*rd;
        d   = abs(mapIntergalacticCloud(pos, id)) + .07;
        lDist      = max(length(mod(pos+sp*.5,sp)-sp*.5), .001);
        noi        = pn(.05*pos);
        lightColor = mix(hsv2rgb(noi,.5,.6),
                         hsv2rgb(noi+.3,.5,.6),
                         smoothstep(rRef*.5, rRef*2., lDist));
        sum.rgb += a*lightColor/exp(lDist*lDist*lDist*.08)/30.;
        if (d < h) {
            td += (1.-td)*(h-d)+.005;
            sum.rgb += sum.a*sum.rgb*.25/lDist;
            sum     += (1.-sum.a)*.02*td*a;
        }
        td += .015;
        t  += max(d*.08*max(min(lDist,d),2.), .01);
    }
    sum = clamp(sum, 0., 1.);
    sum.xyz *= sum.xyz*(3.-sum.xyz-sum.xyz);
    return sum;
}

// ── Main ──────────────────────────────────────────────────────────────────────
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 vScreenPos = (fragCoord/iResolution.xy)*2.-1.;
    vScreenPos.x   *= iResolution.x/iResolution.y;
    vec3 vRayDir    = normalize(vec3(vScreenPos, 1.0));

    vec3 vEuler = vec3(sin(iTime*.2)*.125, sin(iTime*.1)*.125, .5+sin(iTime*.3)*.5);
    if (iMouse.z > 0.) {
        vEuler.x = -((iMouse.y/iResolution.y)*2.-1.);
        vEuler.y = -((iMouse.x/iResolution.x)*2.-1.);
        vEuler.z = 0.;
    }
    vRayDir = RotateX(vRayDir, vEuler.x);
    vRayDir = RotateY(vRayDir, vEuler.y);
    vRayDir = RotateZ(vRayDir, vEuler.z);
 float c     = 2.0;
    float fZPos = 5.0 + iTime*c;
    fParticleLength = 0.25*c/60.0;

    // Stars
    vec3 col  = mix(vec3(.005,0.,.01), vec3(.01,.005,0.), vRayDir.y*.5+.5);
    float fSeed = 0.;
    for (int i=0; i<PASS_COUNT; i++) {
        col  += Starfield(vRayDir, fZPos, fSeed);
        fSeed += 1.234;
    }

    // Clouds — z locked to same speed as stars, lateral drift stays independent
    vec3 ro     = vec3(sin(iTime*.04)*3., cos(iTime*.03)*2., iTime*c);
    vec4 clouds = renderIntergalacticClouds(ro, vRayDir, 22., vec4(.5,.4,.16,.7));
    // Stars punch through clouds, clouds wrap around dark regions
    col = col + clouds.rgb*(1.-clamp(length(col)*2.,0.,1.));

    fragColor = vec4(tanh(col*1.5), 1.);
}