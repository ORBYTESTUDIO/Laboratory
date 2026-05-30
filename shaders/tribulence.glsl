const float PI = 3.14159265;

vec2 tri(vec2 p) { return 1. - abs(p - round(p))*2.; } // triangle wave

// fm : frequency modulation.
vec2 fm(vec2 p) { return tri(p + .7 * tri(1.9 * p + .8)); }

vec2 tribulence(vec2 p)
{
    float angle = 2.399; // Approx golden angle
    float c = cos(angle), s = sin(angle);
    mat2 R = mat2(c,s,-s,c);
    for(float i = 1e-3; i < 5.; i+=i)
    {
        p += fm(p.yx / i * .7 + iTime * .0125) * i *.025;
        p *= R;
    }
    return p;
}

vec3 cmap(float x)
{
    return exp(cos(iTime*.5+PI*x+vec3(1,2,3)));
}

float kernel(float x) { return .1/(x*x+.1); }

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (2. * fragCoord - iResolution.xy)/iResolution.y;
    float ps = 2. / iResolution.y;
    
    float angle = 2.399; // Approx golden angle
    float c = cos(angle), s = sin(angle);
    mat2 R = mat2(c,s,-s,c);
    
    vec2 p = tribulence(uv);
    p = tribulence(R*p);
    p = tribulence(R*R*p);
    p = tribulence(R*R*R*p);

    vec3 color = vec3(0);
    float sdf = length(p);
    float K = kernel(sdf);
    
    color += cmap(K)*sqrt(K);

    color = 1.-exp(-1.5*color*color*color);
    color = pow(color, vec3(1./2.2));
    fragColor = vec4(color, 1);
}