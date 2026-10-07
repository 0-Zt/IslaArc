import json,sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
sp='/tmp/claude-0/-home-claude/558f284c-b565-5c96-8772-2b606b2749ee/scratchpad/'
out=sys.argv[1] if len(sys.argv)>1 else sp+'ritmo.png'
S=json.load(open(sp+'series.json'))
t=[p['t'] for p in S]
REF={'lingote','tablas','ladrillo','vidrio','carbon'}
mats=[('madera','Madera'),('piedra','Piedra'),('arena','Arena'),('tierra','Tierra'),('mineral','Mineral'),('lingote','Lingotes'),('tablas','Tablas'),('ladrillo','Ladrillos'),('carbon','Carbón')]
bounds=[];names=['1 Barro','2 Claro','3 Ruinas','4 Fuego','5 Muelle'];ends=[9,14,18,30,39]
for e in ends:
    tt=next((p['t'] for p in S if p['goal']>=e),None); bounds.append(tt)
SURF='#fcfcfb'; INK='#0b0b0b'; INK2='#52514e'; GRID='#e4e3df'; S1='#2a78d6'; S2='#eb6834'
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'axes.edgecolor':GRID,'axes.labelcolor':INK2,'xtick.color':INK2,'ytick.color':INK2,'text.color':INK})
fig,axs=plt.subplots(4,3,figsize=(11,10),facecolor=SURF)
axs=axs.flatten()
def marks(ax):
    prev=0
    for b,n in zip(bounds,names):
        if b is None: continue
        ax.axvline(b,color=GRID,lw=1,zorder=0)
for ax,(k,n) in zip(axs,mats):
    ax.set_facecolor(SURF)
    cap=[p['cap'][1 if k in REF else 0] for p in S]
    ax.plot(t,cap,color=INK2,lw=1,ls=(0,(4,3)),label='tope')
    ax.plot(t,[p['res'].get(k,0) for p in S],color=S1,lw=2,label='en el almacén')
    ax.set_title(n,loc='left',fontsize=10,color=INK,fontweight='bold')
    ax.set_ylim(0,max(max(cap),1)*1.08); marks(ax)
    ax.grid(axis='y',color=GRID,lw=0.6); ax.tick_params(length=0)
    for sp_ in ax.spines.values(): sp_.set_visible(False)
# figure time panel
ax=axs[9]; ax.set_facecolor(SURF)
ax.plot(t,[100*p['blocked'] for p in S],color=S2,lw=2,label='esperando espacio')
ax.plot(t,[100*p['idle'] for p in S],color=S1,lw=2,label='sin trabajo')
ax.set_title('Tiempo de las figuras (%)',loc='left',fontsize=10,fontweight='bold'); ax.set_ylim(0,100); marks(ax)
ax.legend(frameon=False,fontsize=8,loc='upper left'); ax.grid(axis='y',color=GRID,lw=0.6); ax.tick_params(length=0)
for sp_ in ax.spines.values(): sp_.set_visible(False)
# chapter legend panel
ax=axs[10]; ax.axis('off')
txt='Capítulos (líneas verticales)\n'+'\n'.join(f'{n}: termina en el minuto {b:.1f}' for n,b in zip(names,bounds) if b)
ax.text(0,0.95,txt,va='top',fontsize=9,color=INK)
ax.text(0,0.25,'Línea azul: material en el almacén\nLínea punteada: tope del almacén',va='top',fontsize=9,color=INK2)
axs[11].axis('off')
for ax in axs[:10]: ax.set_xlabel('minutos de juego',fontsize=8)
fig.suptitle('Ritmo de la partida automática: materiales y tope del almacén',x=0.02,ha='left',fontsize=13,fontweight='bold',color=INK)
fig.tight_layout(rect=(0,0,1,0.97))
fig.savefig(out,dpi=110,facecolor=SURF)
print('saved',out,bounds)
