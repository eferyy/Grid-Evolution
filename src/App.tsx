/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { RotateCcw, Undo2, Hammer, Shuffle, Share2, Hand, Settings as SettingsIcon, X, Volume2, Vibrate, AlertTriangle, Snowflake, Grid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

// --- Types ---
type TileConfig = {
  id: string;
  value: number;
  row: number;
  col: number;
  isNew?: boolean;
  isMerged?: boolean;
  isDying?: boolean;
  isVoid?: boolean;
  voidMoves?: number;
  isGhost?: boolean;
  hasMoved?: boolean;
};

type VFXParams = { 
  id: string; 
  r: number; 
  c: number; 
  targetR?: number;
  targetC?: number;
  value?: number;
  type: 'merge' | 'voidPop' | 'degrade' | 'megaWave' | 'trail' | 'mergeSpark'; 
};

interface GameHistory {
  tiles: TileConfig[];
  score: number;
  gridSize: number;
  moves: number;
}

// --- Constants & Helpers ---
const generateId = () => Math.random().toString(36).substring(2, 9);

const getThreshold = (lvl: number) => {
  if (lvl <= 1) return 0;
  if (lvl <= 3) return Math.pow(lvl - 1, 2) * 2500;
  return Math.floor(Math.pow(lvl - 1, 2.5) * 3000);
};

const getLevelInfo = (currentScore: number) => {
  let lvl = 1;
  while (currentScore >= getThreshold(lvl + 1)) {
    lvl++;
  }
  const currentThreshold = getThreshold(lvl);
  const nextThreshold = getThreshold(lvl + 1);
  return { 
    level: lvl, 
    currentThreshold, 
    nextThreshold, 
    xp: currentScore - currentThreshold, 
    requiredXp: nextThreshold - currentThreshold,
    remainingXp: nextThreshold - currentScore
  };
};

const TILE_STYLES: Record<number, { bg: string, text: string }> = {
  2: { bg: '#D7CCC8', text: '#5D4037' },
  4: { bg: '#DCEDC8', text: '#33691E' },
  8: { bg: '#B2EBF2', text: '#006064' },
  16: { bg: '#F8BBD0', text: '#880E4F' },
  32: { bg: '#FFCCBC', text: '#BF360C' },
  64: { bg: '#CFD8DC', text: '#263238' },
  128: { bg: '#E1BEE7', text: '#4A148C' },
  256: { bg: '#C5CAE9', text: '#1A237E' },
  512: { bg: '#B2DFDB', text: '#004D40' },
  1024: { bg: '#FFF9C4', text: '#F57F17' },
  2048: { bg: '#FFE082', text: '#FF6F00' }
};

const getTileStyle = (val: number) => TILE_STYLES[val] || { bg: '#EEEEEE', text: '#424242' };

// --- Memoized Sub-Components ---

const TileComponent = memo(({ 
  tile, 
  gridSize, 
  tileSizePercent, 
  levelUpTrigger,
  isHammerActive,
  onClick
}: { 
  tile: TileConfig, 
  gridSize: number, 
  tileSizePercent: string, 
  levelUpTrigger: number,
  isHammerActive?: boolean,
  onClick?: (id: string) => void
}) => {
  const style = useMemo(() => getTileStyle(tile.value), [tile.value]);
  const isCenterVoid = tile.isVoid && tile.row > 0 && tile.row < gridSize - 1 && tile.col > 0 && tile.col < gridSize - 1;
  const isTargetable = isHammerActive && !tile.isVoid;

  const isTier2 = !tile.isVoid && tile.value >= 64 && tile.value <= 256;
  const isTier3 = !tile.isVoid && tile.value >= 512 && tile.value <= 1024;
  const isTier4 = !tile.isVoid && tile.value >= 2048;

  const boxShadow = useMemo(() => {
    if (tile.isGhost) return 'none';
    if (isTargetable) return `0 0 15px #6366F1, inset 0 0 10px rgba(99, 102, 241, 0.5)`;
    if (levelUpTrigger > 0) return `0 0 30px 10px #6366F1, inset 0 0 15px #6366F1`;
    if (tile.isVoid) return isCenterVoid ? 'inset 0 0 20px rgba(156, 163, 175, 0.4), 0 0 25px 8px rgba(156, 163, 175, 0.5)' : 'inset 0 0 20px rgba(156, 163, 175, 0.4), 0 0 15px rgba(156, 163, 175, 0.6)';
    if (isTier4) return `inset 0 0 20px rgba(255,255,255,0.8), 0 0 40px ${style.bg}`;
    if (isTier3) return `inset 0 0 15px rgba(255,255,255,0.4), 0 0 20px ${style.bg}80`;
    if (isTier2) return `inset 0 0 10px rgba(255,255,255,0.5), 0 0 0 1px #6366F1, 0 8px 16px rgba(0,0,0,0.5)`;
    return `inset 0 0 8px rgba(255,255,255,0.1), 0 8px 16px rgba(0,0,0,0.3)`;
  }, [tile.value, tile.isVoid, tile.isGhost, isTargetable, levelUpTrigger, isCenterVoid, isTier2, isTier3, isTier4, style.bg]);
  const activeShadow = tile.hasMoved ? 'none' : boxShadow;

  const backgroundStyles = useMemo(() => {
    const base: React.CSSProperties = {
        backgroundColor: tile.isVoid ? 'rgba(10, 10, 10, 0.9)' : style.bg,
        color: tile.isVoid ? '#E5E7EB' : style.text,
    };
    if (isTier3 && !tile.isGhost) {
        base.background = `linear-gradient(135deg, ${style.bg} 0%, ${style.bg} 40%, rgba(255,255,255,0.8) 50%, ${style.bg} 60%, ${style.bg} 100%)`;
        base.backgroundSize = '200% 200%';
    }
    return base;
  }, [tile.value, tile.isVoid, tile.isGhost, isTier3, style.bg, style.text]);

  const calculatedX = `calc(((100% + 12px) / ${gridSize}) * ${tile.col})`;
  const calculatedY = `calc(((100% + 12px) / ${gridSize}) * ${tile.row})`;
  const finalZIndex = useMemo(() => {
    const base = tile.row * 10 + tile.col;
    return base + (tile.isGhost ? 400 : (tile.isMerged ? 500 : (tile.isVoid ? 300 : (tile.isDying ? 0 : 100))));
  }, [tile.row, tile.col, tile.isGhost, tile.isMerged, tile.isVoid, tile.isDying]);

  return (
    <motion.div
      initial={tile.isNew || tile.isMerged ? { left: calculatedX, top: calculatedY, scale: 0, opacity: 0 } : false}
      animate={{ 
          left: calculatedX,
          top: calculatedY,
          scale: tile.isVoid ? [1, 1.05, 1] : (levelUpTrigger > 0 ? [1, 1.2, 0.9, 1.1, 1] : (tile.isMerged ? [1, 1.18, 1] : 1)),
          opacity: tile.isGhost ? 0.55 : 1,
          backgroundPosition: (isTier3 && !tile.isGhost && tile.isMerged) ? ['0% 0%', '200% 200%'] : '0% 0%',
          z: 0
      }}
      exit={tile.isGhost ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0 }}
      transition={{
          left: { type: "tween", ease: [0.45, 0.05, 0.55, 0.95], duration: 0.16 },
          top: { type: "tween", ease: [0.45, 0.05, 0.55, 0.95], duration: 0.16 },
          scale: tile.isVoid ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : (levelUpTrigger > 0 ? { duration: 1.2, times: [0, 0.3, 0.6, 0.8, 1], ease: "easeInOut" } : (tile.isNew ? { type: "tween", ease: "easeOut", duration: 0.2, delay: 0.1 } : (tile.isMerged ? { times: [0, 0.5, 1], duration: 0.2, ease: "easeOut", delay: 0.08 } : { type: "tween", ease: [0.45, 0.05, 0.55, 0.95], duration: 0.16 }))),
          backgroundPosition: (isTier3 && tile.isMerged) ? { duration: 1.5, ease: "linear" } : { duration: 0 },
          opacity: { duration: 0.1 }
      }}
      onClick={() => { if (isTargetable && onClick) onClick(tile.id); }}
      className={`absolute flex items-center justify-center rounded-xl sm:rounded-[1.5rem] font-light transform-gpu overflow-hidden ${tile.value >= 64 ? 'z-[25]' : ''} ${isTargetable ? 'cursor-pointer hover:scale-[1.02] ring-2 ring-[#6366F1] pointer-events-auto' : ''} ${tile.isGhost ? 'border-2 border-dashed border-white/50 pointer-events-none z-[45] backdrop-blur-[2px]' : ''}`}
      style={{
          willChange: 'transform, opacity',
          width: tileSizePercent,
          height: tileSizePercent,
          boxShadow: activeShadow,
          zIndex: finalZIndex,
          fontSize: tile.isVoid ? 'clamp(1.5rem, 5vw, 2rem)' : (tile.value > 999
                    ? (gridSize >= 6 ? 'clamp(0.8rem, 2.5vw, 1.1rem)' : gridSize >= 5 ? 'clamp(0.9rem, 3vw, 1.3rem)' : 'clamp(1rem, 3.5vw, 1.5rem)') 
                    : (gridSize >= 6 ? 'clamp(1rem, 3.5vw, 1.3rem)' : gridSize >= 5 ? 'clamp(1.2rem, 4vw, 1.6rem)' : 'clamp(1.3rem, 5vw, 2rem)')),
          border: tile.isGhost ? '2px dashed rgba(255,255,255,0.4)' : (tile.isVoid ? '2px solid #9CA3AF' : (levelUpTrigger > 0 ? '1px solid #6366F1' : 'none')),
          ...backgroundStyles
      }}
    >
      {isTier4 && !tile.isGhost && (
          <motion.div
             animate={{ rotate: 360, filter: ['hue-rotate(0deg)', 'hue-rotate(360deg)'] }}
             transition={{ 
                rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                filter: { duration: 3, repeat: Infinity, ease: "linear" }
             }}
             className="absolute inset-0 z-0 origin-center mix-blend-overlay opacity-80"
             style={{
                 background: `conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)`
             }}
          />
      )}
      
      {tile.isNew && !tile.isGhost && (
          <motion.div
              initial={{ opacity: 0.8 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="absolute inset-0 rounded-[inherit] pointer-events-none z-0"
              style={{
                  boxShadow: `0 0 25px 8px #6366F1`
              }}
          />
      )}
      
      {tile.isVoid ? (
          <span className="relative z-30 font-light" style={{textShadow: '0 0 10px #9CA3AF'}}>{tile.voidMoves}</span>
      ) : (
          <span className="relative z-30">{tile.value}</span>
      )}
    </motion.div>
  );
}, (prev, next) => {
   return prev.tile.id === next.tile.id && 
           prev.tile.row === next.tile.row &&
           prev.tile.col === next.tile.col &&
           prev.tile.value === next.tile.value &&
           prev.tile.isGhost === next.tile.isGhost &&
           prev.tile.isVoid === next.tile.isVoid &&
           prev.tile.isDying === next.tile.isDying &&
           prev.tile.isNew === next.tile.isNew &&
           prev.tile.isMerged === next.tile.isMerged &&
           prev.tile.hasMoved === next.tile.hasMoved &&
           prev.tile.voidMoves === next.tile.voidMoves &&
           prev.gridSize === next.gridSize &&
           prev.tileSizePercent === next.tileSizePercent &&
           prev.levelUpTrigger === next.levelUpTrigger &&
           prev.isHammerActive === next.isHammerActive &&
           prev.onClick === next.onClick;
});

const Header = memo(({ score, highScore, scoreMultiplier, onOpenSettings }: { score: number, highScore: number, scoreMultiplier: number, onOpenSettings: () => void }) => (
<div className="flex justify-between items-start w-full mb-6 relative shrink-0">
    <div className="flex flex-col flex-1 min-w-0 pr-1">
      <h1 className="text-base sm:text-2xl font-light tracking-[0.2em] sm:tracking-[0.3em] opacity-90 pl-1 mt-1 leading-tight whitespace-nowrap">GRID<br/>EVOLUTION</h1>
    </div>
    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
      <div className="flex gap-1.5 sm:gap-2">
        <div className="bg-white/5 backdrop-blur-sm rounded-xl py-1.5 px-1.5 sm:py-2 sm:px-3 flex flex-col items-center border border-white/5 min-w-[56px] sm:min-w-[70px]">
          <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.15em] opacity-40 mb-0.5">Score</span>
          <div className="flex items-center gap-1">
              <span className="text-sm sm:text-lg font-[200] leading-none">{score}</span>
              {scoreMultiplier > 1 && (
                  <span className="text-[0.6rem] leading-none bg-[#FFD700]/20 text-[#FFD700] px-1 py-0.5 rounded-[4px] font-medium tracking-wider relative -top-[1px]">
                      {scoreMultiplier}x
                  </span>
              )}
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-sm rounded-xl py-1.5 px-1.5 sm:py-2 sm:px-3 flex flex-col items-center border border-white/5 min-w-[56px] sm:min-w-[70px]">
          <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.15em] opacity-40 mb-0.5">Best</span>
          <span className="text-sm sm:text-lg font-[200] leading-none">{highScore}</span>
        </div>
      </div>
      <motion.button
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={onOpenSettings}
        className="p-1.5 sm:p-2 text-white/50 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/5 flex shrink-0"
      >
        <SettingsIcon className="w-[18px] h-[18px] sm:w-5 sm:h-5" strokeWidth={1.5} />
      </motion.button>
    </div>
  </div>
));

const LevelBar = memo(({ progress, flash }: { progress: number, flash: boolean }) => (
  <div className="w-full mb-5">
    <div className="w-full h-[3px] bg-white/10 rounded-full overflow-hidden relative">
      <motion.div
        className={`absolute top-0 left-0 h-full rounded-full transition-colors duration-300 ${flash ? 'bg-white' : 'bg-white/40 shimmer-effect'}`}
        initial={{ width: 0 }}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
    </div>
  </div>
));

const Controls = memo(({ undoCount, canUndo, hammerCharge, shuffleCount, onUndo, onClear, onShuffle, onReset, isHammerActive }: any) => (
  <div className="flex justify-between items-center w-full px-2">
    <div className="flex gap-4 items-center">
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={onUndo} disabled={undoCount === 0 || !canUndo}
        className="text-white/40 hover:text-white disabled:opacity-20 transition-colors relative"
      >
        <Undo2 size={20} strokeWidth={1.5} />
        {undoCount > 0 && <span className="absolute -top-1 -right-2 text-[9px] font-bold">{undoCount}</span>}
      </motion.button>
      <motion.button whileHover={hammerCharge === 100 ? { scale: 1.1 } : {}} whileTap={hammerCharge === 100 ? { scale: 0.9 } : {}}
        onClick={onClear} disabled={hammerCharge < 100}
        className={`transition-colors relative flex flex-col items-center justify-center ${
            isHammerActive 
                ? 'text-white [text-shadow:0_0_8px_rgba(255,255,255,0.8)]' 
                : (hammerCharge === 100 ? 'text-white/80 hover:text-white cursor-pointer' : 'text-white/40 cursor-default')
        }`}
      >
        <Hammer size={20} strokeWidth={1.5} className={`mb-0.5 ${hammerCharge === 100 && !isHammerActive ? 'animate-pulse' : ''}`} />
        <div className="w-[120%] h-[2px] bg-white/10 rounded-full overflow-hidden absolute -bottom-1.5 left-[-10%]">
            <div className={`h-full transition-all duration-300 ${hammerCharge === 100 ? 'bg-[#6366F1] shadow-[0_0_5px_#6366F1]' : 'bg-[#6366F1]/50'}`} style={{ width: `${hammerCharge}%` }} />
        </div>
      </motion.button>
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={onShuffle} disabled={shuffleCount === 0}
        className="text-white/40 hover:text-white disabled:opacity-20 transition-colors relative"
      >
        <Shuffle size={20} strokeWidth={1.5} />
        {shuffleCount > 0 && <span className="absolute -top-1 -right-2 text-[9px] font-bold">{shuffleCount}</span>}
      </motion.button>
    </div>

    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
      onClick={onReset}
      className="text-white/40 hover:text-white transition-colors"
    >
      <RotateCcw size={20} strokeWidth={1.5} />
    </motion.button>
  </div>
));

const GridBackground = memo(({ gridSize, tileSizePercent }: { gridSize: number, tileSizePercent: string }) => (
  <div className="absolute inset-3 z-0 pointer-events-none">
    {Array.from({ length: gridSize }).map((_, r) => (
      Array.from({ length: gridSize }).map((_, c) => (
        <div
          key={`bg-${r}-${c}`}
          className="absolute bg-[#1A1A1A] rounded-xl sm:rounded-[1.5rem] shadow-[inset_0_4px_12px_rgba(0,0,0,0.5)]"
          style={{
            width: tileSizePercent,
            height: tileSizePercent,
            left: `calc((${tileSizePercent} + 12px) * ${c})`,
            top: `calc((${tileSizePercent} + 12px) * ${r})`
          }}
        />
      ))
    ))}
  </div>
));

export interface VFXRef {
  addEffects: (newEffects: VFXParams[]) => void;
  clearEffects: () => void;
}

const VFXLayer = memo(React.forwardRef<VFXRef, { tileSizePercent: string }>(({ tileSizePercent }, ref) => {
  const [effects, setEffects] = useState<VFXParams[]>([]);

  React.useImperativeHandle(ref, () => ({
    addEffects: (newEffects: VFXParams[]) => {
      setEffects(prev => [...prev, ...newEffects]);
    },
    clearEffects: () => {
      setEffects([]);
    }
  }));

  const removeEffect = useCallback((id: string) => {
    setEffects(prev => prev.filter(e => e.id !== id));
  }, []);

  return (
      <>
          {effects.map(fx => (
              <VFXParticle key={fx.id} fx={fx} tileSizePercent={tileSizePercent} onComplete={() => removeEffect(fx.id)} />
          ))}
      </>
  );
}));

const VFXParticle = ({ fx, tileSizePercent, onComplete }: { fx: VFXParams, tileSizePercent: string, onComplete: () => void, key?: React.Key }) => {
  const isVoidPop = fx.type === 'voidPop';
  const isDegrade = fx.type === 'degrade';
  const isMegaWave = fx.type === 'megaWave';
  const isTrail = fx.type === 'trail';
  const isMergeSpark = fx.type === 'mergeSpark';
  
  useEffect(() => {
     let timeoutMs = 400; // default for merge etc
     if (isTrail || isMergeSpark) timeoutMs = 100; // Visible but fast cleanup
     else if (isDegrade) timeoutMs = 1500;
     else if (isMegaWave) timeoutMs = 1000;
     
     const timer = setTimeout(() => onComplete(), timeoutMs);
     return () => clearTimeout(timer);
  }, [isTrail, isMergeSpark, isDegrade, isMegaWave, onComplete]);
  
  return (
      <div 
         className={`absolute pointer-events-none flex items-center justify-center transform-gpu ${isTrail ? 'z-20' : 'z-50'}`}
         style={{
             willChange: 'transform, opacity',
             width: tileSizePercent,
             height: tileSizePercent,
             left: `calc((${tileSizePercent} + 12px) * ${fx.c})`,
             top: `calc((${tileSizePercent} + 12px) * ${fx.r})`
         }}
      >
        {isTrail ? (
            <motion.div
                initial={{ opacity: 0.15, scale: 0.95 }}
                animate={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.1, ease: 'easeOut' }}
                onAnimationComplete={onComplete}
                className="absolute inset-0 rounded-xl sm:rounded-[1.5rem] bg-white/20"
            />
        ) : isDegrade ? (
            <motion.div
               initial={{ opacity: 0, scale: 0.5, y: 10 }}
               animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1.4, 1.5], y: [10, -20, -30, -40], x: [-2, 2, -2, 2, 0] }}
               transition={{ duration: 1.2, times: [0, 0.2, 0.8, 1], ease: "easeOut", x: { duration: 0.2, repeat: 2 } }}
               onAnimationComplete={onComplete}
               className="whitespace-nowrap font-black tracking-widest text-[0.6rem] sm:text-[0.7rem] uppercase relative"
            >
               <span className="absolute opacity-70 top-[1px] left-[1px] text-[#6366F1]">EVOLUTION REVERSED</span>
               <span className="absolute opacity-70 top-[-1px] left-[-1px] text-[#F87171]">EVOLUTION REVERSED</span>
               <span className="relative text-white [text-shadow:0_0_10px_rgba(248,113,113,0.8)]">EVOLUTION REVERSED</span>
            </motion.div>
        ) : isMegaWave ? (
            <motion.div
               initial={{ scale: 0.8, opacity: 0.8, borderWidth: '8px' }}
               animate={{ scale: 3.5, opacity: 0, borderWidth: '0px' }}
               transition={{ duration: 0.8, ease: 'easeOut' }}
               onAnimationComplete={onComplete}
               className="absolute inset-0 rounded-xl sm:rounded-[1.5rem] border-[#6366F1] shadow-[0_0_30px_#6366F1_inset,0_0_30px_#6366F1]"
               style={{ zIndex: 100 }}
            />
        ) : isMergeSpark ? (
            <div className="absolute inset-0 flex items-center justify-center">
                {Array.from({ length: 6 }).map((_, i) => {
                    const angle = (i / 6) * Math.PI * 2 + (Math.random() * 0.2);
                    const dist = 25 + Math.random() * 15;
                    return (
                        <motion.div
                            key={`sp-${i}`}
                            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: angle * (180/Math.PI) }}
                            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: [0, 1.5, 0], opacity: [1, 1, 0] }}
                            transition={{ duration: 0.1, ease: 'easeOut' }}
                            onAnimationComplete={i === 0 ? onComplete : undefined}
                            className="absolute bg-white"
                            style={{
                                width: `${6 + Math.random() * 6}px`,
                                height: '1px',
                                boxShadow: '0 0 6px #6366F1, 0 0 2px #FFFFFF',
                                transformOrigin: 'center'
                            }}
                        />
                    );
                })}
            </div>
        ) : (
            <>
                <motion.div
                initial={{ scale: 0.8, opacity: isVoidPop ? 0.9 : 0.6, borderWidth: isVoidPop ? '4px' : '2px' }}
                animate={{ scale: isVoidPop ? 1.6 : 1.3, opacity: 0, borderWidth: '1px' }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                onAnimationComplete={onComplete}
                className={`absolute inset-0 rounded-xl sm:rounded-[1.5rem] border shadow-[0_0_12px_currentColor] ${isVoidPop ? 'border-[#9CA3AF] text-[#9CA3AF]' : 'border-white text-white'}`}
                />
                
                {isVoidPop && Array.from({ length: 5 }).map((_, i) => {
                    const angle = (i / 5) * Math.PI * 2 + (Math.random() * 0.5);
                    const dist = 50 + Math.random() * 30; 
                    const x = Math.cos(angle) * dist;
                    const y = Math.sin(angle) * dist;
                    return (
                        <motion.div
                        key={`p-${i}`}
                        initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
                        animate={{ x, y, scale: 0, opacity: 0, rotate: 180 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className="absolute w-[10px] h-[10px] bg-white rounded-sm shadow-[0_0_8px_#9CA3AF]"
                        />
                    )
                })}
            </>
        )}
      </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [tiles, setTiles] = useState<TileConfig[]>([]);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [highestLevel, setHighestLevel] = useState<number>(1);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameOverStats, setGameOverStats] = useState<{ isNewRecord: boolean, maxBlock: number, finalMoves: number, finalLevel: number, longestCombo: number } | null>(null);
  const [moves, setMoves] = useState<number>(0);
  const movesRef = useRef(0);
  useEffect(() => { movesRef.current = moves; }, [moves]);
  const [maxBlock, setMaxBlock] = useState<number>(2);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [previewDir, setPreviewDir] = useState<{ r: number, c: number } | null>(null);
  const [delayedPreviewDir, setDelayedPreviewDir] = useState<{ r: number, c: number } | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);

  useEffect(() => {
    if (previewDir) {
      const timer = setTimeout(() => {
        setDelayedPreviewDir(previewDir);
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setDelayedPreviewDir(null);
    }
  }, [previewDir]);

  const [flashBar, setFlashBar] = useState(false);
  const [isAppVisible, setIsAppVisible] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(() => !localStorage.getItem('grid-evo-onboarding-complete'));
  const [infoStep, setInfoStep] = useState(1);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('grid-evo-sound') !== 'false');
  const [hapticsEnabled, setHapticsEnabled] = useState(() => localStorage.getItem('grid-evo-haptic') !== 'false');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [savedGameData, setSavedGameData] = useState<any>(null);

  const levelInfo = useMemo(() => getLevelInfo(score), [score]);
  
  const [gridSize, setGridSize] = useState(4);
  const gridSizeRef = useRef(gridSize);
  
  const scoreRef = useRef(score);
  const prevLevelRef = useRef(levelInfo.level);
  
  const [scoreMultiplier, setScoreMultiplier] = useState<number>(() => Number(localStorage.getItem('grid-evo-multiplier')) || 1);
  const scoreMultiplierRef = useRef(scoreMultiplier);
  useEffect(() => { scoreMultiplierRef.current = scoreMultiplier; }, [scoreMultiplier]);
  useEffect(() => { localStorage.setItem('grid-evo-multiplier', String(scoreMultiplier)); }, [scoreMultiplier]);

  // Retention features state
  const [history, setHistory] = useState<GameHistory[]>([]);
  const [powerUps, setPowerUps] = useState({ undo: 3, clear: 1, shuffle: 1 });
  const [comboMessage, setComboMessage] = useState<{text: string, id: number, count?: number} | null>(null);
  const [levelUpMessage, setLevelUpMessage] = useState<{text: string, id: number} | null>(null);
  const [confetti, setConfetti] = useState(0);
  const vfxRef = useRef<VFXRef>(null);
  const [hexaGlow, setHexaGlow] = useState(false);
  const [movesWithoutMerge, setMovesWithoutMerge] = useState<number>(0);
  const entropyRef = useRef(0);
  const [shake, setShake] = useState<{ intensity: number, id: number } | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [longestCombo, setLongestCombo] = useState(0);
  const [levelUpTrigger, setLevelUpTrigger] = useState(0);
  const [isHammerActive, setIsHammerActive] = useState(false);
  const [hammerCharge, setHammerCharge] = useState<number>(100);
  const [isIdle, setIsIdle] = useState(false);
  const isMovingRef = useRef(false);

  useEffect(() => {
    setIsIdle(false);
    const timer = setTimeout(() => {
      setIsIdle(true);
    }, 5000); // 5 seconds of no activity = idle
    return () => clearTimeout(timer);
  }, [tiles, isAppVisible]);

  // Mobile Back Button & Orientation Logic
  const modalsRef = useRef({
      settings: isSettingsOpen,
      info: showInfoModal,
      recovery: showRecoveryModal,
      exit: showExitConfirm,
      reset: showResetConfirm,
      game: gameOver
  });

  useEffect(() => {
      modalsRef.current = {
          settings: isSettingsOpen,
          info: showInfoModal,
          recovery: showRecoveryModal,
          exit: showExitConfirm,
          reset: showResetConfirm,
          game: gameOver
      };
  }, [isSettingsOpen, showInfoModal, showRecoveryModal, showExitConfirm, showResetConfirm, gameOver]);

  useEffect(() => {
      if (typeof window !== 'undefined') {
          // Lock to portrait if possible
          try {
              if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
                  window.screen.orientation.lock('portrait').catch(() => {});
              }
          } catch(e) {}

          const handleBackButton = (e: any) => {
              e.preventDefault();
              const m = modalsRef.current;
              
              if (m.settings) setIsSettingsOpen(false);
              else if (m.info) setShowInfoModal(false);
              else if (m.reset) setShowResetConfirm(false);
              else if (m.exit) setShowExitConfirm(false);
              else if (!m.game && !m.recovery) setShowExitConfirm(true);
          };

          // Try to attach Capacitor back button if available
          let capBackListener: any = null;
          if ((window as any)?.Capacitor?.Plugins?.App) {
              (window as any).Capacitor.Plugins.App.addListener('backButton', handleBackButton).then((l: any) => {
                  capBackListener = l;
              }).catch(() => {});
          }

          document.addEventListener('backbutton', handleBackButton, false);

          window.history.pushState({ isApp: true }, '');
          const handlePopState = (e: PopStateEvent) => {
              window.history.pushState({ isApp: true }, '');
              handleBackButton(e);
          };
          window.addEventListener('popstate', handlePopState);

          return () => {
              document.removeEventListener('backbutton', handleBackButton);
              window.removeEventListener('popstate', handlePopState);
              if (capBackListener && capBackListener.remove) capBackListener.remove();
          };
      }
  }, []);

  const entropyLimit = useMemo(() => {
     let limit = 7;
     if (levelInfo.level > 8) {
         limit = Math.max(5, 7 - Math.floor((levelInfo.level - 8) / 2));
     }
     return limit;
  }, [levelInfo.level]);

  // Handle Visibility Change to save battery
  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsAppVisible(visible);
      if (!visible && audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { gridSizeRef.current = gridSize; }, [gridSize]);

  useEffect(() => { localStorage.setItem('grid-evo-sound', String(soundEnabled)); }, [soundEnabled]);
  useEffect(() => { localStorage.setItem('grid-evo-haptic', String(hapticsEnabled)); }, [hapticsEnabled]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') {
        ctx.resume();
    }
    
    if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current);
    audioTimeoutRef.current = setTimeout(() => {
        if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
            audioCtxRef.current.suspend();
        }
    }, 1000);
    
    return ctx;
  }, []);

  const triggerHaptic = useCallback(async (pattern: number | number[]) => {
    if (!hapticsEnabled) return;
    try {
        if (pattern === 10) {
            await Haptics.impact({ style: ImpactStyle.Light });
        } else if (Array.isArray(pattern) && pattern.length >= 4) {
            await Haptics.vibrate();
        } else {
            await Haptics.impact({ style: ImpactStyle.Heavy });
        }
    } catch (e) {}
  }, [hapticsEnabled]);

  const triggerStoreReviewRef = useRef(false);
  const triggerStoreReview = useCallback((reason: string) => {
    if (triggerStoreReviewRef.current) return;
    triggerStoreReviewRef.current = true;
    try {
       // Capacitor integration
       if ((window as any)?.Capacitor?.Plugins?.App) {
           // Emitting custom event to bridge if we had one
           console.log(`[Store Review] Triggered by: ${reason}`);
           // Typically you might use an in-app review plugin here e.g.
           // cordova-plugin-inappreview or @capacitor-community/in-app-review
       }
    } catch (e) {}
  }, []);

  const playTick = useCallback(() => {
      if (!soundEnabled || !isAppVisible) return;
      try {
          const ctx = getAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') ctx.resume();
          
          const masterNode = ctx.createBiquadFilter();
          masterNode.type = 'highshelf';
          masterNode.frequency.value = 3000;
          masterNode.gain.value = -10;
          masterNode.connect(ctx.destination);
          
          const bufferSize = ctx.sampleRate * 0.1; // 100ms
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
              data[i] = Math.random() * 2 - 1; // White noise
          }
          
          const noiseSrc = ctx.createBufferSource();
          noiseSrc.buffer = buffer;
          
          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'lowpass';
          noiseFilter.frequency.value = 400; // Even softer low-pass for a paper/brush feel
          noiseFilter.Q.value = 0.5;

          const gain = ctx.createGain();
          
          noiseSrc.connect(noiseFilter);
          noiseFilter.connect(gain);
          gain.connect(masterNode);
          
          // Ultra soft attack and slower, whispery decay
          // Highly reduced volume for low-profile rustle
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
          
          noiseSrc.start(ctx.currentTime);
      } catch(e) {}
  }, [getAudioCtx, soundEnabled, isAppVisible]);

  const playVoidPop = useCallback(() => {
      if (!soundEnabled || !isAppVisible) return;
      try {
          const ctx = getAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') ctx.resume();
          
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();
          
          filter.type = 'highpass';
          filter.frequency.value = 600;
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
          
          osc.connect(gain);
          gain.connect(filter);
          filter.connect(ctx.destination);
          
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.1);
      } catch (e) {}
  }, [getAudioCtx, soundEnabled, isAppVisible]);

  const playVoidCreate = useCallback(() => {
      if (!soundEnabled || !isAppVisible) return;
      try {
          const ctx = getAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') ctx.resume();
          
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();
          
          filter.type = 'lowpass';
          filter.frequency.value = 200;
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(60, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
          
          osc.connect(gain);
          gain.connect(filter);
          filter.connect(ctx.destination);
          
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
          
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.5);
      } catch (e) {}
  }, [getAudioCtx, soundEnabled, isAppVisible]);

  const playMerge = useCallback((maxVal: number, comboCount: number = 1) => {
      if (!soundEnabled || !isAppVisible) return;
      try {
          const ctx = getAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') ctx.resume();
          
          const masterFilter = ctx.createBiquadFilter();
          masterFilter.type = 'lowpass';
          masterFilter.frequency.value = 1200; // Woody marimba cut off
          
          const masterGain = ctx.createGain();
          masterGain.gain.value = 0.6; // Reduced overall volume by 50%
          
          masterFilter.connect(masterGain);
          masterGain.connect(ctx.destination);
          
          // Pentatonic scale climbing with combo
          const scales = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
          const comboIndex = Math.min(comboCount - 1, scales.length - 1);
          const rootFreq = scales[comboIndex];
          
          const attack = 0.01; // Fast percussive attack
          const decay = 0.15; // Short woody decay
          const duration = attack + decay;
          
          // Layer 1: Sine wave for body
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(rootFreq, ctx.currentTime);
          osc1.connect(gain1);
          gain1.connect(masterFilter);
          
          gain1.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain1.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + attack);
          gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
          
          osc1.start(ctx.currentTime);
          osc1.stop(ctx.currentTime + duration);
          
          // Layer 2: Triangle wave for mallet hit (octave up)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(rootFreq * 2, ctx.currentTime);
          osc2.connect(gain2);
          gain2.connect(masterFilter);
          
          gain2.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + attack);
          gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration * 0.5); // Faster decay for mallet
          
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + duration);

          // Choir pad for Hexa Evolution
          if (comboCount >= 6) {
              const noteFreq = rootFreq;
              [1, 1.25, 1.5, 2].forEach((mult, idx) => {
                  const padOsc = ctx.createOscillator();
                  const padGain = ctx.createGain();
                  // Mix sine and triangle for softer choir feel
                  padOsc.type = idx % 2 === 0 ? 'sine' : 'triangle';
                  
                  padOsc.frequency.setValueAtTime(noteFreq * mult, ctx.currentTime);
                  padOsc.frequency.linearRampToValueAtTime(noteFreq * mult * 1.01, ctx.currentTime + 1);
                  
                  padGain.gain.setValueAtTime(0.0001, ctx.currentTime);
                  padGain.gain.linearRampToValueAtTime(0.02 / (idx + 1), ctx.currentTime + 0.4);
                  padGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.0);
                  
                  padOsc.connect(padGain);
                  padGain.connect(masterFilter);
                  padOsc.start(ctx.currentTime);
                  padOsc.stop(ctx.currentTime + 2.0);
              });
          }
      } catch(e) {}
  }, [getAudioCtx, soundEnabled, isAppVisible]);

  const playHammerStrike = useCallback(() => {
      if (!soundEnabled || !isAppVisible) return;
      try {
          const ctx = getAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') ctx.resume();
          
          const masterNode = ctx.createBiquadFilter();
          masterNode.type = 'highshelf';
          masterNode.frequency.value = 3000;
          masterNode.gain.value = -10;
          masterNode.connect(ctx.destination);
          
          // Thump (velvet wood resonance)
          const woodOsc = ctx.createOscillator();
          const woodGain = ctx.createGain();
          const woodFilter = ctx.createBiquadFilter();
          
          woodFilter.type = 'lowpass';
          woodFilter.frequency.value = 150; // Deeper and softer
          
          woodOsc.type = 'sine';
          woodOsc.frequency.setValueAtTime(80, ctx.currentTime);
          woodOsc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
          
          woodGain.gain.setValueAtTime(0.0001, ctx.currentTime);
          woodGain.gain.exponentialRampToValueAtTime(1.2, ctx.currentTime + 0.04);
          woodGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
          
          woodOsc.connect(woodGain);
          woodGain.connect(woodFilter);
          woodFilter.connect(masterNode);
          
          woodOsc.start(ctx.currentTime);
          woodOsc.stop(ctx.currentTime + 0.6);
          
          // Noise thump (velvet contact)
          const bufferSize = ctx.sampleRate * 0.2;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
          const noiseSrc = ctx.createBufferSource();
          noiseSrc.buffer = buffer;
          
          const noiseFilter = ctx.createBiquadFilter();
          noiseFilter.type = 'lowpass';
          noiseFilter.frequency.setValueAtTime(600, ctx.currentTime);
          noiseFilter.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
          
          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.0001, ctx.currentTime);
          noiseGain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.03);
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
          
          noiseSrc.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          noiseGain.connect(masterNode);
          
          noiseSrc.start(ctx.currentTime);
      } catch(e) {}
  }, [getAudioCtx, soundEnabled, isAppVisible]);

  const playHammerReady = useCallback(() => {
      if (!soundEnabled || !isAppVisible) return;
      try {
          const ctx = getAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') ctx.resume();
          
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
      } catch (e) {}
  }, [getAudioCtx, soundEnabled, isAppVisible]);

  const playEntropyPenalty = useCallback(() => {
      if (!soundEnabled || !isAppVisible) return;
      try {
          const ctx = getAudioCtx();
          if (!ctx) return;
          if (ctx.state === 'suspended') ctx.resume();
          
          const masterNode = ctx.createBiquadFilter();
          masterNode.type = 'highshelf';
          masterNode.frequency.value = 3000;
          masterNode.gain.value = -10;
          masterNode.connect(ctx.destination);
          
          const bufferSize = ctx.sampleRate * 0.4;
          const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
              // Crackling effect by adding zero gaps
              data[i] = Math.random() > 0.7 ? (Math.random() * 2 - 1) : 0;
          }
          
          const noiseSrc = ctx.createBufferSource();
          noiseSrc.buffer = buffer;
          
          const bandpass = ctx.createBiquadFilter();
          bandpass.type = 'bandpass';
          bandpass.frequency.setValueAtTime(4000, ctx.currentTime);
          bandpass.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
          
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
          
          noiseSrc.connect(bandpass);
          bandpass.connect(gain);
          gain.connect(masterNode);
          
          noiseSrc.start(ctx.currentTime);
          
          triggerHaptic([30, 50, 40]);
      } catch(e) {}
  }, [getAudioCtx, soundEnabled, isAppVisible, triggerHaptic]);

  useEffect(() => {
    if (!localStorage.getItem('grid-evo-onboarding-complete')) {
      setShowInfoModal(true);
      setInfoStep(1);
    }
    const savedHighScore = localStorage.getItem('grid-evo-highscore-pastel');
    const savedHighestLevel = localStorage.getItem('grid-evo-highest-level');

    if (savedHighScore) setHighScore(parseInt(savedHighScore, 10));
    if (savedHighestLevel) setHighestLevel(parseInt(savedHighestLevel, 10));

    // Check for saved game state
    const savedSession = localStorage.getItem('grid-evo-session');
    if (savedSession) {
      try {
        const data = JSON.parse(savedSession);
        if (data.tiles && data.tiles.length > 0 && data.moves > 0) {
          setSavedGameData(data);
          setShowRecoveryModal(true);
          return; // Wait for user choice
        }
      } catch (e) {
        localStorage.removeItem('grid-evo-session');
      }
    }

    initializeGame();
  }, []);

  // Save game session whenever key states change
  useEffect(() => {
    if (tiles.length > 0 && !gameOver && moves > 0) {
      const session = {
        tiles,
        score,
        moves,
        gridSize,
        maxBlock,
        powerUps,
        history
      };
      localStorage.setItem('grid-evo-session', JSON.stringify(session));
    } else if (gameOver || (tiles.length > 0 && moves === 0)) {
      localStorage.removeItem('grid-evo-session');
    }
  }, [tiles, score, moves, gridSize, maxBlock, powerUps, history, gameOver]);

  const loadSavedGame = () => {
    if (savedGameData) {
      setTiles(savedGameData.tiles);
      setScore(savedGameData.score);
      setMoves(savedGameData.moves);
      setGridSize(savedGameData.gridSize);
      gridSizeRef.current = savedGameData.gridSize;
      setMaxBlock(savedGameData.maxBlock || 2);
      setPowerUps(savedGameData.powerUps);
      setHistory(savedGameData.history || []);
      setShowRecoveryModal(false);
      setSavedGameData(null);
    }
  };

  const discardSavedGame = () => {
    localStorage.removeItem('grid-evo-session');
    setShowRecoveryModal(false);
    setSavedGameData(null);
    initializeGame();
  };

  useEffect(() => {
    const currentLevel = levelInfo.level;
    let targetGridSize = 4;
    
    if (currentLevel >= 4 && maxBlock >= 1024) {
      targetGridSize = 6;
    } else if (currentLevel >= 2 && maxBlock >= 256) {
      targetGridSize = 5;
    }

    if (currentLevel > prevLevelRef.current) {
       let message = `LEVEL ${currentLevel} REACHED!`;
       
       if (targetGridSize === 6 && gridSize < 6) {
         message = 'LEVEL UP: 6x6 GRID UNLOCKED!';
       } else if (targetGridSize === 5 && gridSize < 5) {
         message = 'LEVEL UP: 5x5 GRID UNLOCKED!';
       }

       setLevelUpMessage({ text: message, id: Date.now() });
       setConfetti(Date.now());
       setFlashBar(true);
       setLevelUpTrigger(t => t + 1);
       
       triggerHaptic([30, 30, 30, 30, 100]);
       setTimeout(() => setLevelUpMessage(null), 3000);
       setTimeout(() => setFlashBar(false), 500);
       setTimeout(() => setLevelUpTrigger(0), 1200);

       if (currentLevel > highestLevel) {
          setHighestLevel(currentLevel);
          localStorage.setItem('grid-evo-highest-level', currentLevel.toString());
       }

       prevLevelRef.current = currentLevel;
    }
    
    if (targetGridSize !== gridSize) {
        setGridSize(targetGridSize);
        gridSizeRef.current = targetGridSize;
    }
    
  }, [score, highestLevel, gridSize, levelInfo.level, maxBlock, triggerHaptic]);

  const generateSpawnValue = useCallback((lvl: number) => {
    return 2;
  }, []);

  const initializeGame = useCallback(() => {
    localStorage.removeItem('grid-evo-session');
    setScore(0);
    setScoreMultiplier(1);
    setGameOver(false);
    setGameOverStats(null);
    setMoves(0);
    setHistory([]);
    setPowerUps({ undo: 3, clear: 1, shuffle: 1 });
    setHammerCharge(100);
    setGridSize(4);
    gridSizeRef.current = 4;
    vfxRef.current?.clearEffects();
    setTiles([]);

    setTimeout(() => {
      const r1 = Math.floor(Math.random() * 4), c1 = Math.floor(Math.random() * 4);
      let r2, c2;
      do {
        r2 = Math.floor(Math.random() * 4);
        c2 = Math.floor(Math.random() * 4);
      } while (r1 === r2 && c1 === c2);

      setTiles([
        { id: generateId(), value: 2, row: r1, col: c1, isNew: true },
        { id: generateId(), value: generateSpawnValue(1), row: r2, col: c2, isNew: true }
      ]);
    }, 0);
  }, [generateSpawnValue]);

  const handleHardReset = () => {
      localStorage.removeItem('grid-evo-session');
      localStorage.removeItem('grid-evo-highscore-pastel');
      localStorage.removeItem('grid-evo-highest-level');
      localStorage.removeItem('grid-evo-onboarding-complete');
      localStorage.removeItem('grid-evo-multiplier');
      setHighScore(0);
      setHighestLevel(1);
      setScoreMultiplier(1);
      setShowResetConfirm(false);
      setIsSettingsOpen(false);
      initializeGame();
  };

  const checkGameOver = useCallback((activeTiles: TileConfig[], gSize: number) => {
    const board: (TileConfig | null)[][] = Array(gSize).fill(null).map(() => Array(gSize).fill(null));
    activeTiles.forEach(t => {
      if (t.row >= 0 && t.row < gSize && t.col >= 0 && t.col < gSize) {
        board[t.row][t.col] = t;
      }
    });

    for (let r = 0; r < gSize; r++) {
      for (let c = 0; c < gSize; c++) {
        const tile = board[r][c];
        if (!tile || tile.isVoid) continue;
        
        const neighbors = [
            { r: r - 1, c: c },
            { r: r + 1, c: c },
            { r: r, c: c - 1 },
            { r: r, c: c + 1 }
        ];

        for (const n of neighbors) {
            if (n.r >= 0 && n.r < gSize && n.c >= 0 && n.c < gSize) {
                const nTile = board[n.r][n.c];
                if (!nTile) return false; // Can move into empty space
                if (!nTile.isVoid && nTile.value === tile.value) return false; // Can merge
            }
        }
      }
    }
    return true; // No moves or merges possible
  }, []);

  const ghostTiles = useMemo(() => {
    if (!delayedPreviewDir) return [];
    
    const gSize = gridSize;
    const activeTiles = tiles.filter(t => !t.isDying);
    const board: (TileConfig | null)[][] = Array(gSize).fill(null).map(() => Array(gSize).fill(null));
    activeTiles.forEach(t => {
      if (t.row >= 0 && t.row < gSize && t.col >= 0 && t.col < gSize) {
        board[t.row][t.col] = { ...t, isNew: false, isMerged: false, hasMoved: false };
      }
    });

    const processCell = (r: number, c: number, dr: number, dc: number) => {
      const tile = board[r][c];
      if (!tile || tile.isVoid) return;

      let targetR = r;
      let targetC = c;
      let willMergeWith: TileConfig | null = null;

      while(true) {
          const nextR = targetR + dr;
          const nextC = targetC + dc;
          if (nextR < 0 || nextR >= gSize || nextC < 0 || nextC >= gSize) break;
          
          const nextTile = board[nextR][nextC];
          if (nextTile) {
              if (!nextTile.isVoid && nextTile.value === tile.value && !nextTile.isMerged) {
                  willMergeWith = nextTile;
                  targetR = nextR;
                  targetC = nextC;
              }
              break;
          }
          targetR = nextR;
          targetC = nextC;
      }

      if (willMergeWith) {
          const newValue = tile.value * 2;
          board[r][c] = null;
          board[targetR][targetC] = {
              id: willMergeWith.id,
              value: newValue,
              row: targetR,
              col: targetC,
              isMerged: true,
              isVoid: false,
              isGhost: true
          };
      } else if (targetR !== r || targetC !== c) {
          board[r][c] = null;
          board[targetR][targetC] = { ...tile, row: targetR, col: targetC, isGhost: true };
      } else {
          board[r][c] = { ...tile, isGhost: true };
      }
    };

    if (delayedPreviewDir.c === -1) for (let c = 1; c < gSize; c++) for (let r = 0; r < gSize; r++) processCell(r, c, 0, -1);
    else if (delayedPreviewDir.c === 1) for (let c = gSize - 2; c >= 0; c--) for (let r = 0; r < gSize; r++) processCell(r, c, 0, 1);
    else if (delayedPreviewDir.r === -1) for (let r = 1; r < gSize; r++) for (let c = 0; c < gSize; c++) processCell(r, c, -1, 0);
    else if (delayedPreviewDir.r === 1) for (let r = gSize - 2; r >= 0; r--) for (let c = 0; c < gSize; c++) processCell(r, c, 1, 0);

    const ghosts: TileConfig[] = [];
    for (let r = 0; r < gSize; r++) {
        for (let c = 0; c < gSize; c++) {
            if (board[r][c] && !board[r][c]!.isVoid && board[r][c]!.isGhost) {
                ghosts.push({ ...board[r][c]!, id: board[r][c]!.id + '-ghost' });
            }
        }
    }
    return ghosts;
  }, [tiles, delayedPreviewDir, gridSize]);

  const sideEffectsRef = useRef<{ voidPops: number, mergeVal: number, combo: number, hasMerge: boolean, entropyFired: boolean } | null>(null);

  const handleMove = useCallback((dirRow: number, dirCol: number) => {
    if (gameOver || isSettingsOpen || showInfoModal || isMovingRef.current) return;
    isMovingRef.current = true;
    setTimeout(() => { requestAnimationFrame(() => { isMovingRef.current = false; }); }, 140);
    sideEffectsRef.current = null;
    
    setTiles(prevTiles => {
      const gSize = gridSizeRef.current;
      const activeTiles = prevTiles.filter(t => !t.isDying);
      const board: (TileConfig | null)[][] = Array(gSize).fill(null).map(() => Array(gSize).fill(null));
      activeTiles.forEach(t => {
          if (t.row >= 0 && t.row < gSize && t.col >= 0 && t.col < gSize) {
            board[t.row][t.col] = (t.isNew || t.isMerged || t.hasMoved) ? { ...t, isNew: false, isMerged: false, hasMoved: false } : t;
          }
      });

      let changed = false;
      let baseScoreUpdate = 0;
      let mergesInMove = 0;
      let maxMergeValue = 0;
      const dyingTiles: TileConfig[] = [];
      const mergePositions: {r: number, c: number, value: number}[] = [];
      const newEffects: VFXParams[] = [];

      const processCell = (r: number, c: number, dr: number, dc: number) => {
        const tile = board[r][c];
        if (!tile || tile.isVoid) return;

        let targetR = r;
        let targetC = c;
        let willMergeWith: TileConfig | null = null;

        while(true) {
            const nextR = targetR + dr;
            const nextC = targetC + dc;
            if (nextR < 0 || nextR >= gSize || nextC < 0 || nextC >= gSize) break;
            
            const nextTile = board[nextR][nextC];
            if (nextTile) {
                if (!nextTile.isVoid && nextTile.value === tile.value && !nextTile.isMerged) {
                    willMergeWith = nextTile;
                    targetR = nextR;
                    targetC = nextC;
                }
                break;
            }
            targetR = nextR;
            targetC = nextC;
        }

        if (willMergeWith) {
            const dist = Math.max(Math.abs(targetR - r), Math.abs(targetC - c));
            if (dist > 0) {
                const drStep = Math.sign(targetR - r);
                const dcStep = Math.sign(targetC - c);
                for (let i = 0; i < dist; i++) {
                    newEffects.push({ id: generateId(), r: r + drStep * i, c: c + dcStep * i, value: tile.value, type: 'trail' });
                }
            }
            const newValue = tile.value * 2;
            if (newValue >= 1024 && scoreMultiplierRef.current === 1) {
                setScoreMultiplier(1.5);
                // The ref is updated in useEffect, but we also should update it locally for this calculation if we want it to apply immediately to the current move
                scoreMultiplierRef.current = 1.5;
                localStorage.setItem('grid-evo-multiplier', '1.5');
            }
            baseScoreUpdate += newValue;
            if (newValue > maxMergeValue) maxMergeValue = newValue;
            mergesInMove++;
            
            const mergedTile: TileConfig = {
                id: willMergeWith.id,
                value: newValue,
                row: targetR,
                col: targetC,
                isMerged: true,
                isVoid: false,
                voidMoves: undefined,
                hasMoved: true
            };
            
            dyingTiles.push({ ...tile, row: targetR, col: targetC, isDying: true, hasMoved: true });
            
            board[r][c] = null;
            board[targetR][targetC] = mergedTile;
            
            mergePositions.push({ r: targetR, c: targetC, value: newValue });
            newEffects.push({ id: generateId(), r: targetR, c: targetC, type: 'merge' });
            newEffects.push({ id: generateId(), r: targetR, c: targetC, type: 'mergeSpark' });
            if (newValue >= 128) {
                newEffects.push({ id: generateId(), r: targetR, c: targetC, type: 'megaWave' });
            }
            if (newValue >= 2048) {
                triggerStoreReview('2048_reached');
            }
            changed = true;
        } else if (targetR !== r || targetC !== c) {
            const dist = Math.max(Math.abs(targetR - r), Math.abs(targetC - c));
            const drStep = Math.sign(targetR - r);
            const dcStep = Math.sign(targetC - c);
            for (let i = 0; i < dist; i++) {
                newEffects.push({ id: generateId(), r: r + drStep * i, c: c + dcStep * i, value: tile.value, type: 'trail' });
            }
            board[r][c] = null;
            board[targetR][targetC] = { ...tile, row: targetR, col: targetC, hasMoved: true };
            changed = true;
        }
      };

      if (dirCol === -1) for (let c = 1; c < gSize; c++) for (let r = 0; r < gSize; r++) processCell(r, c, 0, -1);
      else if (dirCol === 1) for (let c = gSize - 2; c >= 0; c--) for (let r = 0; r < gSize; r++) processCell(r, c, 0, 1);
      else if (dirRow === -1) for (let r = 1; r < gSize; r++) for (let c = 0; c < gSize; c++) processCell(r, c, -1, 0);
      else if (dirRow === 1) for (let r = gSize - 2; r >= 0; r--) for (let c = 0; c < gSize; c++) processCell(r, c, 1, 0);

      // Void countdown runs on EVERY swipe attempt, not just when changed
      let voidPopsCount = 0;
      for (let r = 0; r < gSize; r++) {
          for (let c = 0; c < gSize; c++) {
              let t = board[r][c];
              if (t && t.isVoid && t.voidMoves !== undefined) {
                  const newMoves = t.voidMoves - 1;
                  if (newMoves <= 0) {
                      t = { ...t, voidMoves: 0, isDying: true };
                      dyingTiles.push(t);
                      voidPopsCount++;
                      newEffects.push({ id: generateId(), r, c, type: 'voidPop' });
                      board[r][c] = null;
                  } else {
                      board[r][c] = { ...t, voidMoves: newMoves };
                  }
              }
          }
      }

      if (changed || voidPopsCount > 0) {
          if (changed) setLongestCombo(prev => Math.max(prev, mergesInMove));

          const nextTiles: TileConfig[] = [...dyingTiles];
      const emptySpots: { r: number, c: number }[] = [];
      for (let r = 0; r < gSize; r++) {
          for (let c = 0; c < gSize; c++) {
              if (board[r][c]) nextTiles.push(board[r][c]!);
              else emptySpots.push({ r, c });
          }
      }

      const totalInteractions = mergesInMove;
        const currentLevel = getLevelInfo(scoreRef.current).level;
        
        let entropyLimit = gSize === 6 ? 4 : (gSize === 5 ? 5 : 7);
        
        let isEntropyApplied = false;
        if (totalInteractions === 0) {
            entropyRef.current += 1;
            if (entropyRef.current >= entropyLimit) {
                entropyRef.current = 0;
                isEntropyApplied = true;
            }
        } else {
            entropyRef.current = 0;
        }

        let shakeIntensity = 0;
        if (maxMergeValue >= 2048) {
            shakeIntensity = 12;
        } else if (maxMergeValue >= 1024) {
            shakeIntensity = 8;
        } else if (maxMergeValue >= 512) {
            shakeIntensity = 4;
        }

        if (maxMergeValue > 256) {
            setFlashActive(true);
            setTimeout(() => setFlashActive(false), 200);
        }

        if (shakeIntensity > 0) {
            setShake({ intensity: shakeIntensity, id: Date.now() });
            setTimeout(() => setShake(null), 300);
        }

        if (isEntropyApplied) {
            const aliveTiles = nextTiles.filter(t => !t.isDying && !t.isVoid);
            if (aliveTiles.length > 0) {
                const sortedAlive = [...aliveTiles].sort((a,b) => b.value - a.value);
                const firstTarget = sortedAlive[0];
                const secondTarget = sortedAlive.length > 1 ? sortedAlive[1] : null;
                
                firstTarget.value = Math.max(2, firstTarget.value / 2);
                newEffects.push({ id: generateId(), r: firstTarget.row, c: firstTarget.col, type: 'degrade' });
                
                if (secondTarget) {
                    secondTarget.value = Math.max(2, secondTarget.value / 2);
                    newEffects.push({ id: generateId(), r: secondTarget.row, c: secondTarget.col, type: 'degrade' });
                }
                
            }
        }

        const comboMultiplier = Math.max(1, totalInteractions);
        const finalScoreUpdate = Math.round((baseScoreUpdate) * comboMultiplier * scoreMultiplierRef.current);

        // Collect side effect intents (no audio/haptic calls inside setTiles)
        const mergedTilesForSound = nextTiles.filter(t => t.isMerged && !t.isVoid);
        const highestValForSound = mergedTilesForSound.length > 0 ? Math.max(...mergedTilesForSound.map(t => t.value)) : 16;
        sideEffectsRef.current = {
            voidPops: voidPopsCount,
            mergeVal: highestValForSound,
            combo: comboMultiplier,
            hasMerge: totalInteractions > 0,
            entropyFired: isEntropyApplied
        };

        if (emptySpots.length > 0) {
          const currentLevel = getLevelInfo(scoreRef.current).level;
          let spawnCount = 1;
          if (emptySpots.length > (gSize * gSize) * 0.70) {
              spawnCount = 2;
          }

          for (let i = 0; i < spawnCount && emptySpots.length > 0; i++) {
              const spotIndex = Math.floor(Math.random() * emptySpots.length);
              const spot = emptySpots[spotIndex];
              
              nextTiles.push({ 
                  id: generateId(), 
                  value: generateSpawnValue(currentLevel), 
                  row: spot.r, 
                  col: spot.c, 
                  isNew: true
              });
              
              emptySpots.splice(spotIndex, 1);
          }
          
          const maxVoids = gSize === 4 ? 2 : gSize === 5 ? 3 : 5;
          const currentVoids = nextTiles.filter(t => t.isVoid && !t.isDying).length;
          
          if (emptySpots.length > 0 && Math.floor(movesRef.current + 1) % 5 === 0 && currentVoids < maxVoids) {
              const baseChance = 0.60;
              const levelBonus = (currentLevel - 1) * 0.05;
              const voidChance = Math.min(baseChance + levelBonus, 0.95);

              if (Math.random() < voidChance) {
                  const innerSpots = emptySpots.filter(spot => spot.r > 0 && spot.r < gSize - 1 && spot.c > 0 && spot.c < gSize - 1);
                  const outerSpots = emptySpots.filter(spot => spot.r === 0 || spot.r === gSize - 1 || spot.c === 0 || spot.c === gSize - 1);
                  let voidSpot;
                  let spotsToVoid: {r: number, c: number}[] = [];
                  
                  if (gSize >= 5 && Math.random() < 0.3 && innerSpots.length > 0) {
                      const potentialTopLefts = emptySpots.filter(s => 
                          s.r < gSize - 1 && s.c < gSize - 1 &&
                          emptySpots.find(e => e.r === s.r + 1 && e.c === s.c) &&
                          emptySpots.find(e => e.r === s.r && e.c === s.c + 1) &&
                          emptySpots.find(e => e.r === s.r + 1 && e.c === s.c + 1)
                      );
                      
                      if (potentialTopLefts.length > 0) {
                          const tl = potentialTopLefts[Math.floor(Math.random() * potentialTopLefts.length)];
                          spotsToVoid.push(tl);
                          spotsToVoid.push({r: tl.r + 1, c: tl.c});
                          spotsToVoid.push({r: tl.r, c: tl.c + 1});
                          spotsToVoid.push({r: tl.r + 1, c: tl.c + 1});
                      }
                  }
                  
                  if (spotsToVoid.length === 0) {
                      if (innerSpots.length > 0 && Math.random() < 0.8) {
                          voidSpot = innerSpots[Math.floor(Math.random() * innerSpots.length)];
                      } else if (outerSpots.length > 0) {
                          voidSpot = outerSpots[Math.floor(Math.random() * outerSpots.length)];
                      } else {
                          voidSpot = innerSpots[Math.floor(Math.random() * innerSpots.length)];
                      }
                      
                      if (voidSpot) {
                          spotsToVoid.push(voidSpot);
                      }
                  }

                  if (spotsToVoid.length > 0) {
                      const voidDuration = gSize >= 5 ? 6 + Math.floor(Math.random() * 3) : (Math.random() < 0.5 ? 4 : 5);
                      playVoidCreate();
                      spotsToVoid.forEach(spot => {
                          nextTiles.push({
                              id: generateId(),
                              value: 0,
                              row: spot.r,
                              col: spot.c,
                              isVoid: true,
                              voidMoves: voidDuration,
                              isNew: true
                          });
                      });
                  }
              }
          }
        }

        // --- DEFER STATE UPDATES (State Batching) ---
        setTimeout(() => {
            requestAnimationFrame(() => {
                // Entropy updates
            if (totalInteractions === 0) {
                if (isEntropyApplied) {
                    setMovesWithoutMerge(0);
                } else {
                    setMovesWithoutMerge(entropyRef.current);
                }
            } else {
                setMovesWithoutMerge(0);
            }

            setHistory(h => [...h, { tiles: prevTiles, score: scoreRef.current, gridSize: gSize, moves: movesRef.current }].slice(-10));
            setMoves(m => m + 1);
            setHammerCharge(prev => {
                if (prev < 100) {
                    const next = Math.min(100, prev + 1);
                    if (next === 100) playHammerReady();
                    return next;
                }
                return prev;
            });

            if (totalInteractions > 1) {
              let comboTextStr = '';
              if (comboMultiplier === 2) comboTextStr = 'DOUBLE';
              else if (comboMultiplier === 3) comboTextStr = 'TRIPLE';
              else if (comboMultiplier === 4) comboTextStr = 'QUADRUPLE';
              else if (comboMultiplier === 5) comboTextStr = 'PENTA';
              else if (comboMultiplier >= 6) comboTextStr = 'HEXA EVOLUTION';

              if (comboMultiplier >= 6) {
                  setHexaGlow(true);
                  setTimeout(() => setHexaGlow(false), 1000);
              }

              setComboMessage({ text: comboTextStr, id: Date.now(), count: comboMultiplier });
              const duration = comboMultiplier >= 6 ? 4000 : 1000 + (comboMultiplier * 300);
              setTimeout(() => setComboMessage(null), duration);
            }

            setScore(s => {
              const newScore = s + finalScoreUpdate;
              setHighScore(h => {
                 if (newScore > h && h > 0 && newScore - h > 1000) {
                     triggerStoreReview('high_score');
                 }
                 const best = Math.max(h, newScore);
                 localStorage.setItem('grid-evo-highscore-pastel', best.toString());
                 return best;
              });
              return newScore;
            });

            const nextValidState = nextTiles.filter(t => !t.isDying);
            const currentMaxBlock = Math.max(...nextValidState.filter(t => !t.isVoid).map(t => t.value), 2);
            setMaxBlock(prev => Math.max(prev, currentMaxBlock));

            if (checkGameOver(nextValidState, gSize)) {
               setGameOver(true);
               const nextScore = scoreRef.current + finalScoreUpdate;
               const isRecord = nextScore > highScore;
               setGameOverStats({
                   isNewRecord: isRecord,
                   maxBlock: Math.max(...nextValidState.map(t => t.value)),
                   finalMoves: movesRef.current + 1,
                   finalLevel: getLevelInfo(nextScore).level,
                   longestCombo: Math.max(longestCombo, mergesInMove)
               });
               if (isRecord) setConfetti(Date.now());
            }
            });
        }, 50);

        const dyingIds = new Set(dyingTiles.map(t => t.id));
        setTimeout(() => {
            requestAnimationFrame(() => {
                setTiles(current => current.filter(t => !dyingIds.has(t.id)));
            });
        }, 160);
        
        if (newEffects.length > 0) {
            requestAnimationFrame(() => {
                vfxRef.current?.addEffects(newEffects);
            });
        }
        
        return nextTiles;
      }
      return prevTiles;
    });

    // Fire deferred side effects OUTSIDE setTiles
    const fx = sideEffectsRef.current;
    if (fx) {
        if (fx.voidPops > 0) playVoidPop();
        if (fx.entropyFired) {
            playEntropyPenalty();
            triggerHaptic([100, 50, 100]);
        }
        if (fx.hasMerge) {
            playMerge(fx.mergeVal, fx.combo);
            if (fx.combo >= 5) triggerHaptic([50, 30, 50, 50, 100]);
            else if (fx.combo >= 2) triggerHaptic([30, 40]);
            else triggerHaptic(20);
        } else {
            playTick();
            triggerHaptic(10);
        }
    }
  }, [checkGameOver, gameOver, hapticsEnabled, playMerge, playTick, playVoidPop, playVoidCreate, playHammerReady, playEntropyPenalty, highScore, generateSpawnValue, isSettingsOpen, showInfoModal, triggerHaptic]);

  const handleUndo = useCallback(() => {
    if (powerUps.undo <= 0 || history.length === 0 || gameOver) return;
    const lastState = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setTiles(lastState.tiles);
    setScore(lastState.score);
    setMoves(lastState.moves);
    if (gridSize !== lastState.gridSize) {
      setGridSize(lastState.gridSize);
      gridSizeRef.current = lastState.gridSize;
    }
    const undoneMaxBlock = Math.max(...lastState.tiles.filter(t => !t.isDying && !t.isVoid).map(t => t.value), 2);
    setMaxBlock(undoneMaxBlock);
    setPowerUps(p => ({ ...p, undo: p.undo - 1 }));
  }, [powerUps.undo, history, gameOver, gridSize]);

  const gameContextRef = useRef({ gameOver, hammerCharge, isHammerActive });
  useEffect(() => {
    gameContextRef.current = { gameOver, hammerCharge, isHammerActive };
  }, [gameOver, hammerCharge, isHammerActive]);

  const handleClear = useCallback(() => {
    const { hammerCharge, gameOver } = gameContextRef.current;
    if (hammerCharge < 100 || gameOver) return;
    setIsHammerActive(prev => !prev);
  }, []);

  const executeClear = useCallback((id: string) => {
    const { isHammerActive, hammerCharge, gameOver } = gameContextRef.current;
    if (!isHammerActive || hammerCharge < 100 || gameOver) return;
    
    const realId = id.replace('-ghost', '');
    let targetTile: TileConfig | undefined;
    setTiles(prev => {
        targetTile = prev.find(t => t.id === realId);
        if (!targetTile || targetTile.isDying || targetTile.isVoid) return prev;
        return prev.filter(t => t.id !== realId);
    });
    
    if (targetTile) {
        vfxRef.current?.addEffects([{ id: generateId(), r: targetTile!.row, c: targetTile!.col, type: 'voidPop' }]);
        setHammerCharge(0);
        setIsHammerActive(false);
        playHammerStrike();
        triggerHaptic([150, 100, 150]);
    }
  }, [playHammerStrike, triggerHaptic]);

  const handleShuffle = useCallback(() => {
    if (powerUps.shuffle <= 0 || gameOver) return;
    setTiles(prev => {
       const active = prev.filter(t => !t.isDying && !t.isVoid);
       const voids = prev.filter(t => !t.isDying && t.isVoid);
       const positions = active.map(t => ({ row: t.row, col: t.col }));
       for (let i = positions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [positions[i], positions[j]] = [positions[j], positions[i]];
       }
       return [...active.map((t, i) => ({ ...t, row: positions[i].row, col: positions[i].col })), ...voids];
    });
    setPowerUps(p => ({ ...p, shuffle: p.shuffle - 1 }));
  }, [powerUps.shuffle, gameOver]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameOver || isSettingsOpen || showInfoModal) return;
      if (isHammerActive) return;
      
      let nextDir: { r: number, c: number } | null = null;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); nextDir = { r: -1, c: 0 }; break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); nextDir = { r: 1, c: 0 }; break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); nextDir = { r: 0, c: -1 }; break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); nextDir = { r: 0, c: 1 }; break;
      }
      
      if (nextDir) {
          setPreviewDir(prev => prev?.r === nextDir!.r && prev?.c === nextDir!.c ? prev : nextDir);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (gameOver || isSettingsOpen || showInfoModal) {
          setPreviewDir(null);
          return;
      }
      if (isHammerActive) return;
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': setPreviewDir(null); handleMove(-1, 0); break;
        case 'ArrowDown': case 's': case 'S': setPreviewDir(null); handleMove(1, 0); break;
        case 'ArrowLeft': case 'a': case 'A': setPreviewDir(null); handleMove(0, -1); break;
        case 'ArrowRight': case 'd': case 'D': setPreviewDir(null); handleMove(0, 1); break;
      }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown, { passive: false });
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }
  }, [handleMove, gameOver, isSettingsOpen, showInfoModal, isHammerActive]);

  useEffect(() => {
    if (confetti > 0) {
      const timer = setTimeout(() => setConfetti(0), 3000);
      return () => clearTimeout(timer);
    }
  }, [confetti]);

  const onTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    // Pre-warm audio and haptics on physical interaction
    if (soundEnabled) getAudioCtx();

    if (gameOver || isSettingsOpen || showInfoModal) return;
    if (isHammerActive) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    setTouchStart({ x: clientX, y: clientY });
    if (!('touches' in e)) setIsMouseDown(true);
  };

  const onTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (touchStart) {
        if ('touches' in e) e.preventDefault(); // Prevent scrolling on touch
        
        if (!('touches' in e) && !isMouseDown) return;

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        const dx = clientX - touchStart.x;
        const dy = clientY - touchStart.y;

        let nextDir: { r: number, c: number } | null = null;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dx) > 10) nextDir = dx > 0 ? { r: 0, c: 1 } : { r: 0, c: -1 };
        } else {
          if (Math.abs(dy) > 10) nextDir = dy > 0 ? { r: 1, c: 0 } : { r: -1, c: 0 };
        }
        if (nextDir) {
           setPreviewDir(prev => prev?.r === nextDir!.r && prev?.c === nextDir!.c ? prev : nextDir);
        }
    }
  };

  const onTouchEnd = () => {
    if (touchStart && previewDir) {
      handleMove(previewDir.r, previewDir.c);
    }
    setTouchStart(null);
    setPreviewDir(null);
    setIsMouseDown(false);
  };

  const getBackgroundColor = (size: number) => {
      if (size >= 6) return '#222222';
      if (size >= 5) return '#1a1a1a';
      return '#121212';
  };

  const tileSizePercent = useMemo(() => `calc((100% - ${(gridSize - 1) * 12}px) / ${gridSize})`, [gridSize]);

  return (
    <motion.div
      animate={{ backgroundColor: getBackgroundColor(gridSize) }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="h-[100dvh] w-full flex flex-col items-center font-sans text-white overflow-hidden relative overscroll-none select-none touch-none"
      style={{
          paddingTop: 'max(env(safe-area-inset-top), 1.5rem)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)'
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onTouchStart}
      onMouseMove={onTouchMove}
      onMouseUp={onTouchEnd}
      onMouseLeave={onTouchEnd}
    >
      <div className="mobile-landscape-warning absolute inset-0 z-[200] hidden bg-[#121212] items-center justify-center flex-col text-center p-6 h-[100dvh]">
          <AlertTriangle size={48} className="text-[#6366F1] mb-6"/>
          <h2 className="text-xl font-light tracking-[0.2em] mb-3 uppercase">Rotate Device</h2>
          <p className="text-sm text-white/60 font-light tracking-widest leading-relaxed max-w-sm">
             Grid Evolution is designed to be played in portrait mode. Please rotate your phone to continue.
          </p>
      </div>

      {/* Exit Confirmation Modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-[#121212]/90 backdrop-blur-lg flex flex-col items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#050505] rounded-[2.5rem] w-full max-w-[320px] p-8 shadow-2xl border border-white/5 text-center"
            >
              <div className="w-16 h-16 bg-red-400/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} className="text-red-400" />
              </div>
              <h2 className="text-xl font-light tracking-[0.2em] mb-3 text-white uppercase">Wait!</h2>
              <p className="text-xs text-white/40 font-light tracking-widest leading-relaxed mb-8">
                Are you sure you want to exit?
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                      if ((window as any)?.Capacitor?.Plugins?.App) {
                          (window as any).Capacitor.Plugins.App.exitApp();
                      } else {
                         // On web, we cannot reliably close the tab. Just close the modal.
                         setShowExitConfirm(false);
                      }
                  }}
                  className="w-full py-4 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-2xl text-xs tracking-[0.2em] uppercase font-light transition-colors"
                >
                  Exit App
                </button>
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="w-full py-4 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white rounded-2xl text-xs tracking-[0.2em] uppercase font-light transition-colors"
                >
                  Keep Playing
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Recovery Modal */}
      <AnimatePresence>
        {showRecoveryModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-[#121212]/90 backdrop-blur-lg flex flex-col items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#050505] rounded-[2.5rem] w-full max-w-[320px] p-8 shadow-2xl border border-white/5 text-center"
            >
              <div className="w-16 h-16 bg-[#A2D2FF]/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RotateCcw size={32} className="text-[#A2D2FF]" />
              </div>
              <h2 className="text-xl font-light tracking-[0.2em] mb-3 uppercase">Welcome Back</h2>
              <p className="text-xs text-white/40 font-light tracking-widest leading-relaxed mb-8">
                You have an unfinished game.<br/>Would you like to continue?
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={loadSavedGame}
                  className="w-full py-4 bg-white text-black rounded-2xl text-xs tracking-[0.2em] uppercase font-light transition-transform active:scale-95 shadow-xl"
                >
                  Continue Game
                </button>
                <button
                  onClick={discardSavedGame}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-2xl text-xs tracking-[0.2em] uppercase font-light transition-colors border border-white/5"
                >
                  Start New
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Confetti Overflow */}
      {isAppVisible && confetti > 0 && (
        <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
           {Array.from({ length: 40 }).map((_, i) => (
             <div 
               key={`${confetti}-${i}`} 
               className="confetti absolute top-[-20px] w-2 h-4 rounded-sm" 
               style={{ 
                  left: `${Math.random() * 100}%`, 
                  backgroundColor: ['#D7CCC8', '#DCEDC8', '#B2EBF2', '#F8BBD0', '#FFE082'][Math.floor(Math.random()*5)],
                  animationDuration: `${2 + Math.random() * 2}s`,
                  animationDelay: `${Math.random() * 0.5}s`
               }} 
             />
           ))}
        </div>
      )}

      <AnimatePresence>
        {flashActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15, transition: { duration: 0.05 } }}
            exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
            className="fixed inset-0 z-0 pointer-events-none bg-[#6366F1] block"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hexaGlow && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="fixed inset-0 z-[100] pointer-events-none mix-blend-screen"
            style={{
              background: 'radial-gradient(circle at center, transparent 0%, rgba(255, 215, 0, 0.15) 100%)'
            }}
          />
        )}
      </AnimatePresence>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="absolute inset-0 z-[70] bg-[#121212]/80 backdrop-blur-md flex flex-col items-center justify-center p-6"
          >
             <div className="bg-[#050505] rounded-3xl w-full max-w-[320px] p-8 shadow-2xl border border-white/5 relative flex flex-col items-center text-center">
                
                {infoStep === 1 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
                     <div className="flex gap-2 items-center mb-6">
                         <div className="w-10 h-10 bg-[#D7CCC8] text-[#5D4037] rounded-xl flex items-center justify-center text-lg font-bold">2</div>
                         <div className="text-white/30 text-lg">+</div>
                         <div className="w-10 h-10 bg-[#D7CCC8] text-[#5D4037] rounded-xl flex items-center justify-center text-lg font-bold">2</div>
                         <div className="text-white/50 animate-pulse text-xl ml-1 mr-1">=</div>
                         <div className="w-12 h-12 bg-[#DCEDC8] text-[#33691E] rounded-xl flex items-center justify-center text-xl font-bold shadow-[0_0_15px_rgba(220,237,200,0.4)]">4</div>
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">THE CORE MECHANIC</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        Swipe to slide all tiles. When two tiles with the same value collide, they MERGE into a single, higher-value tile to evolve the grid.
                     </p>
                  </motion.div>
                )}

                {infoStep === 2 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
                     <div className="w-16 h-16 rounded-xl border border-[#F87171]/30 shadow-[inset_0_0_20px_rgba(248,113,113,0.3)] mb-6 flex items-center justify-center animate-pulse">
                         <AlertTriangle size={28} className="text-[#F87171]" />
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">ENTROPY & DEGRADATION</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        ENTROPY ALERT! If no merges occur for 7 moves (decreases as you level up), your highest tile loses half its value. Keep moving!
                     </p>
                  </motion.div>
                )}

                {infoStep === 3 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
                     <div className="w-16 h-16 bg-[#1A1A1A] rounded-[1.5rem] border border-[#9CA3AF]/40 mb-6 flex items-center justify-center font-extralight text-[#9CA3AF] text-3xl">
                         5
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">TEMPORAL VOIDS</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        TEMPORAL VOIDS! These areas appearing in the center of the grid restrict your movements. You cannot pass through until the timer runs out.
                     </p>
                  </motion.div>
                )}

                {infoStep === 4 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
                     <div className="w-16 h-16 rounded-xl border border-[#6366F1]/40 shadow-[0_0_15px_rgba(99,102,241,0.5)] mb-6 flex items-center justify-center bg-[#6366F1]/10">
                         <Hammer size={28} className="text-[#6366F1]" />
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">THE MANUAL HAMMER</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        STRATEGIC INTERVENTION! When fully charged, select the hammer and destroy any tile on the grid. Successful moves charge the hammer.
                     </p>
                  </motion.div>
                )}

                {infoStep === 5 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
                     <div className="mb-6 flex items-center justify-center border border-white/10 rounded-xl p-3 bg-white/5">
                        <Grid size={42} strokeWidth={1} className="text-[#9CA3AF] animate-pulse" />
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">SCALING CHALLENGE</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        THE GRID EXPANDS! As you level up, the area grows, voids increase, and Entropy time shrinks. Can you reach the limit?
                     </p>
                  </motion.div>
                )}

                <div className="flex gap-4 w-full mt-8">
                   {infoStep > 1 && (
                      <button 
                         onClick={() => setInfoStep(s => s - 1)}
                         className="flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-light tracking-[0.15em] text-xs transition-colors uppercase"
                      >
                         BACK
                      </button>
                   )}
                   <button 
                      onClick={() => {
                         if (infoStep < 5) {
                             setInfoStep(s => s + 1);
                         } else {
                             localStorage.setItem('grid-evo-onboarding-complete', 'true');
                             setShowInfoModal(false);
                         }
                      }}
                      className="flex-[2] py-3.5 rounded-xl bg-[#6366F1]/20 hover:bg-[#6366F1]/30 text-[#6366F1] font-light tracking-[0.15em] text-xs transition-colors uppercase"
                   >
                      {infoStep < 5 ? 'NEXT' : 'START'}
                   </button>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over Modal */}
      <AnimatePresence>
        {gameOver && gameOverStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="fixed inset-0 z-[200] bg-[#050505]/80 backdrop-blur-xl flex flex-col items-center justify-between py-12 px-6"
          >
            {/* Header */}
            <motion.div 
               initial={{ y: -30, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.2, duration: 0.8 }}
               className="mt-8 text-center"
            >
               <h1 className="text-xl md:text-2xl font-black text-[#6366F1] tracking-[0.3em] uppercase [text-shadow:0_0_15px_rgba(99,102,241,0.5)]">
                 EVOLUTION HALTED
               </h1>
            </motion.div>

            {/* Main Score & Stats */}
            <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md gap-10">
               <motion.div 
                 initial={{ scale: 0.8, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 transition={{ delay: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                 className="flex flex-col items-center relative"
               >
                  {gameOverStats.isNewRecord && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1 }}
                      className="absolute -top-6 bg-[#FFE082]/10 border border-[#FFE082]/30 text-[#FFE082] px-4 py-1 text-[10px] sm:text-xs font-bold tracking-[0.2em] rounded-full uppercase shadow-[0_0_20px_rgba(255,224,130,0.3)] whitespace-nowrap"
                    >
                      New Record!
                    </motion.div>
                  )}
                  <div className="text-[4rem] sm:text-[5rem] font-light leading-none tracking-tight text-white [text-shadow:0_0_25px_rgba(255,224,130,0.2)]">
                     {score}
                  </div>
                  <div className="text-sm tracking-[0.3em] text-white/40 mt-2 uppercase font-light">
                     Final Score
                  </div>
               </motion.div>

               {/* Stats Grid */}
               <motion.div 
                 initial={{ y: 20, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 transition={{ delay: 0.6, duration: 0.6 }}
                 className="grid grid-cols-2 gap-4 w-full px-2"
               >
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-[#FFE082]/70 uppercase">Largest Block</span>
                     <span className="text-xl font-light text-white">{gameOverStats.maxBlock}</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-white/40 uppercase">Total Moves</span>
                     <span className="text-xl font-light text-white">{gameOverStats.finalMoves}</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-white/40 uppercase">Efficiency</span>
                     <span className="text-xl font-light text-white">{gameOverStats.finalMoves > 0 ? (score / gameOverStats.finalMoves).toFixed(1) : 0}</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-white/40 uppercase">Longest Combo</span>
                     <span className="text-xl font-light text-white tracking-wider">{gameOverStats.longestCombo}</span>
                  </div>
                  <div className="col-span-2 bg-white/5 border border-white/5 rounded-2xl p-4 flex flex-col gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-[#6366F1]/70 uppercase">Evolution Level</span>
                     <span className="text-xl font-light text-white">{gameOverStats.finalLevel}</span>
                  </div>
               </motion.div>
            </div>

            {/* Actions */}
            <motion.div 
               initial={{ y: 30, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.8, duration: 0.6 }}
               className="w-full max-w-md flex flex-col gap-4 mt-8 mb-4"
            >
               <button 
                  onClick={initializeGame} 
                  className="w-full py-4 bg-white text-black hover:bg-white/90 rounded-2xl text-xs sm:text-sm tracking-[0.2em] font-light uppercase transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center justify-center gap-3 active:scale-[0.98]"
               >
                  <RotateCcw size={18} strokeWidth={1.5} /> Retry
               </button>
               <button 
                  onClick={() => {
                     const text = `I reached Level ${gameOverStats.finalLevel} with ${score} points in Grid Evolution!\nLargest block: ${gameOverStats.maxBlock}\nMoves: ${gameOverStats.finalMoves}`;
                     if (navigator.share) navigator.share({ title: 'Grid Evolution Stats', text }).catch(err=>console.log(err));
                     else { navigator.clipboard.writeText(text); alert('Stats copied to clipboard!'); }
                  }}
                  className="w-full py-4 bg-transparent border border-white/10 text-white/80 hover:text-white hover:bg-white/5 rounded-2xl text-xs sm:text-sm tracking-[0.2em] font-light uppercase transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
               >
                  <Share2 size={16} strokeWidth={1.5} /> Share Results
               </button>
            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="absolute inset-0 z-[60] bg-[#121212]/80 backdrop-blur-md flex flex-col items-center justify-center p-6"
          >
            <div className="bg-[#050505] rounded-3xl w-full max-w-[320px] p-6 shadow-2xl border border-white/5 relative">
               <button onClick={() => setIsSettingsOpen(false)} className="absolute top-5 right-5 text-white/40 hover:text-white transition-colors">
                 <X size={20}/>
               </button>
               <h3 className="text-lg font-light tracking-[0.2em] text-center mb-8 mt-2 uppercase">Settings</h3>
               
               <div className="flex justify-between items-center mb-6 px-2">
                  <span className="font-light tracking-wide opacity-80 flex items-center gap-3"><Volume2 size={18}/> Sound</span>
                  <button onClick={() => setSoundEnabled(!soundEnabled)} className={`w-12 h-6 rounded-full relative transition-colors ${soundEnabled ? 'bg-[#D7CCC8]' : 'bg-white/10'}`}>
                     <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${soundEnabled ? 'left-7 bg-[#5D4037]' : 'left-1 bg-white/50'}`} />
                  </button>
               </div>
               
               <div className="flex justify-between items-center mb-8 px-2">
                  <span className="font-light tracking-wide opacity-80 flex items-center gap-3"><Vibrate size={18}/> Haptics</span>
                  <button onClick={() => setHapticsEnabled(!hapticsEnabled)} className={`w-12 h-6 rounded-full relative transition-colors ${hapticsEnabled ? 'bg-[#D7CCC8]' : 'bg-white/10'}`}>
                     <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${hapticsEnabled ? 'left-7 bg-[#5D4037]' : 'left-1 bg-white/50'}`} />
                  </button>
               </div>

               <div className="border-t border-white/5 pt-6 mt-2 flex flex-col gap-3">
                  <button 
                     onClick={() => {
                        setIsSettingsOpen(false);
                        setShowInfoModal(true);
                        setInfoStep(1);
                     }}
                     className="w-full py-3.5 rounded-xl bg-white/5 text-white/90 font-light tracking-[0.15em] text-xs hover:bg-white/10 transition-colors uppercase"
                  >
                     HOW TO PLAY
                  </button>
                  {!showResetConfirm ? (
                     <button onClick={() => setShowResetConfirm(true)} className="w-full py-3.5 rounded-xl bg-red-500/10 text-red-400 font-light tracking-[0.15em] text-xs hover:bg-red-500/20 transition-colors uppercase">Reset Progress</button>
                  ) : (
                     <div className="flex flex-col gap-3">
                         <span className="text-center text-xs text-red-400 font-light tracking-widest flex items-center justify-center gap-2">
                           <AlertTriangle size={14} /> Are you sure?
                         </span>
                         <div className="flex gap-3">
                             <button onClick={handleHardReset} className="flex-1 py-3 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-light tracking-widest text-xs transition-colors">YES</button>
                             <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-light tracking-widest text-xs transition-colors">NO</button>
                         </div>
                     </div>
                  )}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col w-full h-full max-w-[500px]">
        <div className="flex flex-col w-full px-4 pt-2 pb-2 shrink-0 z-20">
            <Header score={score} highScore={highScore} scoreMultiplier={scoreMultiplier} onOpenSettings={() => setIsSettingsOpen(true)} />
            <LevelBar progress={levelInfo.xp / levelInfo.requiredXp} flash={flashBar} />

            {/* Combo Message (Relocated between Level Bar and Controls) */}
            <div className="h-8 flex items-center justify-center relative">
              <AnimatePresence>
                  {comboMessage && !levelUpMessage && (
                    <motion.div
                      key={comboMessage.id}
                      initial={{ opacity: 0, scale: 0.5, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 1.1, y: -10 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      className="absolute z-40 pointer-events-none"
                      style={{ willChange: 'opacity, transform' }}
                    >
                      <div 
                        className={`px-4 py-1 rounded-full font-medium tracking-[0.2em] uppercase border backdrop-blur-sm transition-all ${comboMessage.count && comboMessage.count >= 6 ? 'border-white/20 bg-white/5 text-white' : 'text-[#6366F1] border-[#6366F1]/40 bg-[#6366F1]/10'}`}
                        style={{
                            fontSize: comboMessage.count && comboMessage.count > 2 ? `${1 + Math.min(comboMessage.count - 2, 4) * 0.2}rem` : '1rem',
                            boxShadow: comboMessage.count && comboMessage.count >= 6 ? `0 0 30px rgba(255,255,255,0.15)` : (comboMessage.count && comboMessage.count > 2 ? `0 0 ${15 + (comboMessage.count - 2)*10}px rgba(99,102,241,0.6)` : '0 0 15px rgba(99,102,241,0.4)'),
                            textShadow: comboMessage.count && comboMessage.count >= 6 ? `none` : (comboMessage.count && comboMessage.count > 2 ? `0 0 ${8 + (comboMessage.count - 2)*5}px rgba(99,102,241,0.8)` : 'none')
                        }}
                      >
                        {comboMessage.count && comboMessage.count >= 6 ? (
                           <motion.span
                             animate={{ 
                               filter: [
                                 'hue-rotate(0deg)', 
                                 'hue-rotate(360deg)'
                               ] 
                             }}
                             transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                             style={{
                               backgroundImage: 'linear-gradient(to right, #EF4444, #F97316, #EAB308, #22C55E, #3B82F6, #6366F1, #A855F7)',
                               WebkitBackgroundClip: 'text',
                               WebkitTextFillColor: 'transparent',
                               display: 'inline-block',
                             }}
                           >
                             {comboMessage.text}!
                           </motion.span>
                        ) : (
                           `${comboMessage.text}!`
                        )}
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>
            </div>

            <Controls
              undoCount={powerUps.undo} canUndo={history.length > 0}
              hammerCharge={hammerCharge} shuffleCount={powerUps.shuffle}
              onUndo={handleUndo} onClear={handleClear} onShuffle={handleShuffle} onReset={initializeGame}
              isHammerActive={isHammerActive}
            />
        </div>

        <div className="flex-1 w-full flex items-center justify-center px-4 relative z-10 shrink min-h-0">
          <AnimatePresence>
            {comboMessage && comboMessage.count && comboMessage.count >= 2 && (
               <motion.div
                 key="combo-aura"
                 initial={{ opacity: 0 }}
                 animate={{ opacity: comboMessage.count >= 6 ? 0.8 : (comboMessage.count >= 4 ? 0.6 : 0.3) }}
                 exit={{ opacity: 0 }}
                 transition={{ duration: 0.5 }}
                 className="absolute inset-0 pointer-events-none flex items-center justify-center -z-10 overflow-visible"
                 style={{ willChange: 'opacity, transform' }}
               >
                 {comboMessage.count >= 6 && (
                     <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.2 }}
                        className="fixed inset-0 bg-[#6366F1] pointer-events-none"
                        style={{ maskImage: 'radial-gradient(ellipse at center, transparent 40%, black 100%)', WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 40%, black 100%)' }}
                     />
                 )}
                 <motion.div
                    animate={
                        comboMessage.count >= 6 ? { scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7], filter: ['hue-rotate(0deg)', 'hue-rotate(360deg)'] } : 
                        comboMessage.count >= 4 ? { scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 1 }
                    }
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className={`bg-[#FBBF24] rounded-full absolute ${comboMessage.count >= 4 ? 'w-[140%] aspect-square blur-3xl translate-y-1/4' : 'w-[90%] aspect-square blur-xl translate-y-0'}`}
                 />
               </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            animate={
                shake ? { x: [-shake.intensity, shake.intensity, -shake.intensity, shake.intensity, -shake.intensity/2, shake.intensity/2, 0] } : 
                (levelUpTrigger > 0 ? { scale: [1, 1.05, 1], filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)'] } : { scale: 1, filter: 'brightness(1)' })}
            transition={{ duration: shake ? 0.4 : 0.6, ease: "easeInOut" }}
            className={`relative w-full aspect-square bg-[#1E1E1E] rounded-[2rem] p-3 touch-none overflow-hidden transition-colors duration-700 ${(!isIdle && isAppVisible && movesWithoutMerge >= entropyLimit - 1) ? 'shadow-[0_0_60px_rgba(248,113,113,0.3)] border border-[#F87171]/30' : (!isIdle && isAppVisible && movesWithoutMerge >= entropyLimit - 2) ? 'shadow-[0_0_40px_rgba(248,113,113,0.15)] border border-[#F87171]/10' : 'shadow-2xl border border-white/5'}`}
            style={{ maxWidth: 'min(100%, 60vh)' }}
          >
            {(!isIdle && isAppVisible && movesWithoutMerge >= entropyLimit - 2) && (
                <div 
                   className={`absolute inset-0 pointer-events-none rounded-[2rem] z-40 animate-pulse ${movesWithoutMerge >= entropyLimit - 1 ? 'shadow-[inset_0_0_80px_rgba(248,113,113,0.4)]' : 'shadow-[inset_0_0_40px_rgba(248,113,113,0.2)]'}`} 
                   style={{ animationDuration: movesWithoutMerge >= entropyLimit - 1 ? '1s' : '2s' }}
                />
            )}
            
            <AnimatePresence>
                {levelUpMessage && (
                  <motion.div
                    key={`lvl-${levelUpMessage.id}`}
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                  >
                    <div className="bg-[#B2EBF2] text-[#006064] px-8 py-4 rounded-3xl text-sm font-light tracking-widest uppercase text-center mx-4 [box-shadow:0_25px_50px_-12px_rgba(0,0,0,0.5)]">
                      {levelUpMessage.text}
                    </div>
                  </motion.div>
                )}
            </AnimatePresence>

            {/* Background Empty Cells */}
            <GridBackground gridSize={gridSize} tileSizePercent={tileSizePercent} />

            <div className="absolute inset-3 z-10 block pointer-events-none">
              <AnimatePresence initial={false}>
                {tiles.map(tile => (
                  <TileComponent
                    key={tile.id}
                    tile={tile}
                    gridSize={gridSize}
                    tileSizePercent={tileSizePercent}
                    levelUpTrigger={levelUpTrigger}
                    isHammerActive={isHammerActive}
                    onClick={executeClear}
                  />
                ))}
                {ghostTiles.map(tile => (
                  <TileComponent
                    key={tile.id}
                    tile={tile}
                    gridSize={gridSize}
                    tileSizePercent={tileSizePercent}
                    levelUpTrigger={levelUpTrigger}
                    isHammerActive={isHammerActive}
                    onClick={executeClear}
                  />
                ))}
              </AnimatePresence>
            </div>
            {/* VFX Layer added with pointer-events-none */}
            <div className="absolute inset-3 z-[60] pointer-events-none">
                 <VFXLayer ref={vfxRef} tileSizePercent={tileSizePercent} />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
