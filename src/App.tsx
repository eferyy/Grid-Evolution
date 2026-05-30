/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { RotateCcw, Undo2, Hammer, Shuffle, Share2, Hand, Settings as SettingsIcon, X, Volume2, Vibrate, AlertTriangle, Snowflake, Grid, Zap, Home } from 'lucide-react';
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
const CHALLENGE_LEVELS = Array.from({ length: 105 }, (_, i) => {
  const lvl = i + 1;
  let target = 32;
  let gridSize = 4;
  const archetype = lvl % 5;
  let levelStyle = "STRATEJI";

  // A. Izgara Boyutu Dağılımı (20. bölümden sonra esnek geçiş)
  if (lvl >= 20) {
    if (lvl % 6 === 0) gridSize = 5;
    else if (lvl % 6 === 3) gridSize = 6;
  }

  // B. Taban Hedef Blok Belirleme (Tiers)
  let baseTarget = 32;
  if (lvl > 10) baseTarget = 64;
  if (lvl > 25) baseTarget = 128;
  if (lvl > 45) baseTarget = 256;
  if (lvl > 70) baseTarget = 512;
  if (lvl > 90) baseTarget = 1024;

  let voidInterval = 7;
  let voidChance = 0.15;
  let bufferFactor = 1.8;
  let tileSpawnModifier = "normal"; // 2 veya 4 doğma kuralı

  // C. 5'li Arketip Çarkı
  if (archetype === 1) {
    // 1. Tarz: SPRINT -> Sıfır engel, dar hamle, hızlı birleştirme
    levelStyle = "SPRINT";
    target = baseTarget;
    bufferFactor = 1.3;
    voidInterval = 999;
    voidChance = 0;
  } else if (archetype === 2) {
    // 2. Tarz: KAOS -> Çok sık engel, cömert hamle, hayatta kalma
    levelStyle = "KAOS";
    target = baseTarget;
    bufferFactor = 2.4;
    voidInterval = gridSize === 4 ? 4 : 5;
    voidChance = 0.25;
  } else if (archetype === 3) {
    // 3. Tarz: BEREKET -> Sadece 4 ve 8 karoları doğar! Hedef yüksek, hamle azdır
    levelStyle = "BEREKET";
    target = baseTarget * 2; // Taşlar büyük doğduğu için hedef iki katı!
    if (target > 1024) target = 1024;
    bufferFactor = 1.1; // Büyük taşlar doğduğu için matematiksel hamle ihtiyacı çok düşüktür
    voidInterval = 8;
    voidChance = 0.12;
    tileSpawnModifier = "lucky"; // Agent oyun içinde sadece 4 ve 8 doğuracak
  } else if (archetype === 4) {
    // 4. Tarz: KABUS -> Engeller tahtada 2 kat uzun kalır, yüksek hata payı tamponu
    levelStyle = "KABUS";
    target = baseTarget;
    bufferFactor = 2.1;
    voidInterval = 6;
    voidChance = 0.22;
  } else {
    // 5. Tarz: STRATEJİ -> Dengeli standart taktik mod
    levelStyle = "STRATEJI";
    target = baseTarget;
    bufferFactor = 1.7;
    voidInterval = 7;
    voidChance = 0.15;
  }

  // D. Adil Hamle Hesaplama Kalkanı
  const minPossibleMoves = target / 2;
  const moves = Math.floor(minPossibleMoves * bufferFactor) + 15;

  return { level: lvl, target, moves, voidInterval, voidChance, gridSize, levelStyle, tileSpawnModifier };
});

// CSS clamp() fallback for older WebView engines (Android 7-8, AOSP WebView < Chrome 79)
// Falls back to the preferred (middle) value which uses vw units for responsiveness
const safeClamp = (min: string, preferred: string, max: string): string => {
  try {
    if (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('font-size', `clamp(${min}, ${preferred}, ${max})`)) {
      return `clamp(${min}, ${preferred}, ${max})`;
    }
  } catch (_e) { /* CSS.supports not available */ }
  return preferred;
};

const TRANSLATIONS: Record<string, any> = {
  en: {
    score: "Score",
    best: "Best",
    undo: "Undo",
    hammer: "Hammer",
    shuffle: "Shuffle",
    resetProgress: "Reset Progress",
    howToPlay: "How to Play",
    wait: "Wait!",
    areYouSureExit: "Are you sure you want to exit?",
    exitApp: "Exit App",
    keepPlaying: "Keep Playing",
    welcomeBack: "Welcome Back",
    continueGame: "Continue Game",
    startNew: "Start New",
    rotateDevice: "Rotate Device",
    retry: "Retry",
    shareResults: "Share Results",
    back: "Back",
    next: "Next",
    start: "Start",
    settings: "Settings",
    sound: "Sound",
    haptics: "Haptics",
    yes: "YES",
    no: "NO",
    areYouSure: "Are you sure?",
    warningText: "Grid Evolution is designed to be played in portrait mode. Please rotate your phone to continue.",
    recoveryText: "You have an unfinished game.<br/>Would you like to continue?",
    evolutionHalted: "EVOLUTION HALTED",
    finalScore: "Final Score",
    largestBlock: "Largest Block",
    totalMoves: "Total Moves",
    efficiency: "Efficiency",
    longestCombo: "Longest Combo",
    evolutionLevel: "Evolution Level",
    newRecord: "New Record!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "LEVEL UP: 5x5 GRID UNLOCKED!",
    levelUpUnlocked6x6: "LEVEL UP: 6x6 GRID UNLOCKED!",
    levelReached: "LEVEL {level} REACHED!",
    step1Title: "THE CORE MECHANIC",
    step1Desc: "Swipe to slide all tiles. When two tiles with the same value collide, they MERGE into a single, higher-value tile to evolve the grid.",
    step2Title: "ENTROPY & DEGRADATION",
    step2Desc: "ENTROPY ALERT! If no merges occur for 7 moves (decreases as you level up), your highest tile loses half its value. Keep moving!",
    step3Title: "TEMPORAL VOIDS",
    step3Desc: "TEMPORAL VOIDS! These areas appearing in the center of the grid restrict your movements. You cannot pass through until the timer runs out.",
    step4Title: "THE MANUAL HAMMER",
    step4Desc: "STRATEGIC INTERVENTION! When fully charged, select the hammer and destroy any tile on the grid. Successful moves charge the hammer.",
    step5Title: "SCALING CHALLENGE",
    step5Desc: "THE GRID EXPANDS! As you level up, the area grows, voids increase, and Entropy time shrinks. Can you reach the limit?",
    shareMessage: "I reached Level {level} with {score} points in Grid Evolution!\nLargest block: {maxBlock}\nMoves: {moves}",
    language: "Language",
    reduceEffects: "Reduce Effects",
    loadingText: "LOADING GRID EVOLUTION...",
    challengeMode: "CHALLENGE",
    selectStage: "SELECT STAGE",
    stageWord: "STAGE",
    returnToTree: "RETURN TO MAP",
    backWord: "BACK",
    systemUpdateRequired: "SYSTEM UPDATE REQUIRED",
    webviewWarningText: "Grid Evolution's graphics engine requires a newer Android System WebView. Please update to resume playing.",
    updateWebviewBtn: "UPDATE WEBVIEW",
    resumeWord: "RESUME"
  },
  tr: {
    score: "Skor",
    best: "En İyi",
    undo: "Geri Al",
    hammer: "Çekiç",
    shuffle: "Karıştır",
    resetProgress: "İlerlemeyi Sıfırla",
    howToPlay: "Nasıl Oynanır",
    wait: "Bekle!",
    areYouSureExit: "Çıkmak istediğinize emin misiniz?",
    exitApp: "Oyundan Çık",
    keepPlaying: "Oynamaya Devam Et",
    welcomeBack: "Tekrar Hoş Geldiniz",
    continueGame: "Oyuna Devam Et",
    startNew: "Yeni Başla",
    rotateDevice: "Cihazı Döndür",
    retry: "Yeniden Dene",
    shareResults: "Sonuçları Paylaş",
    back: "Geri",
    next: "İleri",
    start: "Başla",
    settings: "Ayarlar",
    sound: "Ses",
    haptics: "Titreşim",
    yes: "EVET",
    no: "HAYIR",
    areYouSure: "Emin misiniz?",
    warningText: "Grid Evolution dikey modda oynanacak şekilde tasarlanmıştır. Devam etmek için lütfen telefonunuzu döndürün.",
    recoveryText: "Yarım kalmış bir oyununuz var.<br/>Devam etmek ister misiniz?",
    evolutionHalted: "EVRİM DURDU",
    finalScore: "Son Skor",
    largestBlock: "En Büyük Blok",
    totalMoves: "Toplam Hamle",
    efficiency: "Verimlilik",
    longestCombo: "En Uzun Kombo",
    evolutionLevel: "Evrim Seviyesi",
    newRecord: "Yeni Rekor!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "SEVİYE YÜKSELDİ: 5x5 IZGARA AÇILDI!",
    levelUpUnlocked6x6: "SEVİYE YÜKSELDİ: 6x6 IZGARA AÇILDI!",
    levelReached: "SEVİYE {level} ULAŞILDI!",
    step1Title: "ANA MEKANİK",
    step1Desc: "Tüm karoları kaydırmak için sürükleyin. Aynı değere sahip iki karo çarpıştığında, ızgarayı evrimleştirmek için daha yüksek değerli tek bir karo halinde BİRLEŞİRLER.",
    step2Title: "ENTROPİ VE DEGRADASYON",
    step2Desc: "ENTROPİ UYARISI! 7 hamle boyunca hiç birleşme olmazsa (seviye atladıkça azalır), en yüksek karonuz değerinin yarısını kaybeder. Hareket etmeye devam edin!",
    step3Title: "ZAMANSAL BOŞLUKLAR",
    step3Desc: "ZAMANSAL BOŞLUKLAR! Izgaranın ortasında beliren bu alanlar hareketlerinizi kısıtlar. Zamanlayıcı bitene kadar buradan geçemezsiniz.",
    step4Title: "MANUEL ÇEKİÇ",
    step4Desc: "STRATEJİK MÜDAHALE! Tamamen şarj olduğunda, çekici seçip ızgaradaki herhangi bir karoyu yok edin. Başarılı hamleler çekici şarj eder.",
    step5Title: "ÖLÇEKLENEN ZORLUK",
    step5Desc: "IZGARA GENİŞLİYOR! Seviye atladıkça alan büyür, boşluklar artar ve Entropi süresi kısalır. Sınıra ulaşabilir misiniz?",
    shareMessage: "Grid Evolution oyununda {score} puanla Seviye {level}'e ulaştım!\nEn büyük blok: {maxBlock}\nHamle sayısı: {moves}",
    language: "Dil",
    reduceEffects: "Efektleri Azalt",
    loadingText: "GRID EVOLUTION YÜKLENIYOR...",
    challengeMode: "MEYDAN OKUMA",
    selectStage: "AŞAMA SEÇİN",
    stageWord: "BÖLÜM",
    returnToTree: "BÖLÜM SEÇİMİNE DÖN",
    backWord: "GERİ",
    systemUpdateRequired: "SİSTEM GÜNCELLEMESİ GEREKLİ",
    webviewWarningText: "Grid Evolution'ın grafik arayüzü ve 120 FPS motoru, cihazınızdaki Android System WebView tarafından desteklenmiyor. Kesintisiz oyun deneyimi için lütfen WebView uygulamasını güncelleyin.",
    updateWebviewBtn: "WEBVIEW'U GÜNCELLE",
    resumeWord: "DEVAM"
  },
  es: {
    score: "Puntuación",
    best: "Mejor",
    undo: "Deshacer",
    hammer: "Martillo",
    shuffle: "Mezclar",
    resetProgress: "Restablecer Progreso",
    howToPlay: "Cómo Jugar",
    wait: "¡Espera!",
    areYouSureExit: "¿Seguro que quieres salir?",
    exitApp: "Salir de la App",
    keepPlaying: "Seguir Jugando",
    welcomeBack: "Bienvenido de Nuevo",
    continueGame: "Continuar Partida",
    startNew: "Empezar de Nuevo",
    rotateDevice: "Rotar Dispositivo",
    retry: "Reintentar",
    shareResults: "Compartir Resultados",
    back: "Atrás",
    next: "Siguiente",
    start: "Comenzar",
    settings: "Ajustes",
    sound: "Sonido",
    haptics: "Vibración",
    yes: "SÍ",
    no: "NO",
    areYouSure: "¿Estás seguro?",
    warningText: "Grid Evolution está diseñado para jugarse en modo retrato. Rota tu teléfono para continuar.",
    recoveryText: "Tienes una partida sin terminar.<br/>¿Te gustaría continuar?",
    evolutionHalted: "EVOLUCIÓN DETENIDA",
    finalScore: "Puntuación Final",
    largestBlock: "Bloque Más Grande",
    totalMoves: "Movimientos Totales",
    efficiency: "Eficiencia",
    longestCombo: "Combo Más Largo",
    evolutionLevel: "Nivel de Evolución",
    newRecord: "¡Nuevo Récord!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "¡NIVEL UP: TABLERO 5x5 DESBLOQUEADO!",
    levelUpUnlocked6x6: "¡NIVEL UP: TABLERO 6x6 DESBLOQUEADO!",
    levelReached: "¡NIVEL {level} ALCANZADO!",
    step1Title: "LA MECÁNICA CENTRAL",
    step1Desc: "Desliza para mover todas las fichas. Cuando dos fichas del mismo valor chocan, se FUSIONAN en una sola de mayor valor para hacer evolucionar el tablero.",
    step2Title: "ENTROPÍA Y DEGRADACIÓN",
    step2Desc: "¡ALERTA DE ENTROPÍA! Si no hay fusiones durante 7 movimientos (disminuye al subir de nivel), tu ficha más alta pierde la mitad de su valor. ¡Sigue moviéndote!",
    step3Title: "VACÍOS TEMPORALES",
    step3Desc: "¡VACÍOS TEMPORALES! Estas áreas que aparecen en el centro del tablero limitan tus movimientos. No podrás pasar hasta que termine el temporizador.",
    step4Title: "EL MARTILLO MANUAL",
    step4Desc: "¡INTERVENCIÓN ESTRATÉGICA! Cuando esté cargado por completo, selecciona el martillo y destruye cualquier ficha del tablero. Los movimientos exitosos lo cargan.",
    step5Title: "DESAFÍO DE ESCALA",
    step5Desc: "¡EL TABLERO SE EXPANDE! Al subir de nivel, el área crece, los vacíos aumentan y el tiempo de Entropía disminuye. ¿Podrás llegar al límite?",
    shareMessage: "¡Alcancé el nivel {level} con {score} puntos en Grid Evolution!\nBloque más grande: {maxBlock}\nMovimientos: {moves}",
    language: "Idioma",
    reduceEffects: "Reducir Efectos",
    loadingText: "CARGANDO GRID EVOLUTION...",
    challengeMode: "DESAFÍO",
    selectStage: "SELECCIONAR NIVEL",
    stageWord: "NIVEL",
    returnToTree: "VOLVER AL MAPA",
    backWord: "ATRÁS",
    systemUpdateRequired: "ACTUALIZACIÓN DE SISTEMA REQUERIDA",
    webviewWarningText: "El motor gráfico de Grid Evolution requiere una versión más reciente de Android System WebView. Por favor, actualícelo para reanudar el juego.",
    updateWebviewBtn: "ACTUALIZAR WEBVIEW",
    resumeWord: "REANUDAR"
  },
  fr: {
    score: "Score",
    best: "Meilleur",
    undo: "Annuler",
    hammer: "Marteau",
    shuffle: "Mélanger",
    resetProgress: "Réinitialiser",
    howToPlay: "Comment Jouer",
    wait: "Attendez !",
    areYouSureExit: "Voulez-vous vraiment quitter ?",
    exitApp: "Quitter l'App",
    keepPlaying: "Continuer",
    welcomeBack: "Bon Retour",
    continueGame: "Continuer",
    startNew: "Nouveau Jeu",
    rotateDevice: "Pivoter l'Appareil",
    retry: "Recommencer",
    shareResults: "Partager",
    back: "Retour",
    next: "Suivant",
    start: "Démarrer",
    settings: "Paramètres",
    sound: "Son",
    haptics: "Haptique",
    yes: "OUI",
    no: "NON",
    areYouSure: "Êtes-vous sûr ?",
    warningText: "Grid Evolution est conçu pour le mode portrait. Veuillez pivoter votre téléphone pour continuer.",
    recoveryText: "Vous avez une partie en cours.<br/>Voulez-vous la continuer ?",
    evolutionHalted: "ÉVOLUTION ARRÊTÉE",
    finalScore: "Score Final",
    largestBlock: "Plus Grand Bloc",
    totalMoves: "Mouvements Totaux",
    efficiency: "Efficacité",
    longestCombo: "Plus Long Combo",
    evolutionLevel: "Niveau d'Évolution",
    newRecord: "Nouveau Record !",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "NIVEAU SUPÉRIEUR : GRILLE 5x5 DÉBLOQUÉE !",
    levelUpUnlocked6x6: "NIVEAU SUPÉRIEUR : GRILLE 6x6 DÉBLOQUÉE !",
    levelReached: "NIVEAU {level} ATTEINT !",
    step1Title: "MÉCANIQUE DE BASE",
    step1Desc: "Faites glisser pour déplacer toutes les tuiles. Lorsque deux tuiles de même valeur se rencontrent, elles FUSIONNENT en une seule pour faire évoluer la grille.",
    step2Title: "ENTROPIE & DÉGRADATION",
    step2Desc: "ALERTE D'ENTROPIE ! Sans fusion pendant 7 coups (diminue avec les niveaux), votre tuile la plus haute perd la moitié de sa valeur. Continuez à bouger !",
    step3Title: "VIDES TEMPORELS",
    step3Desc: "VIDES TEMPORELS ! Ces zones apparaissant au centre de la grille restreignent vos mouvements. Impossible de passer avant la fin du compte à rebours.",
    step4Title: "LE MARTEAU MANUEL",
    step4Desc: "INTERVENTION STRATÉGIQUE ! Une fois chargé, sélectionnez le marteau pour détruire n'importe quelle tuile. Les mouvements réussis chargent le marteau.",
    step5Title: "DÉFI DE TAILLE",
    step5Desc: "LA GRILLE S'AGRANDIT ! À mesure que vous montez de niveau, la grille grandit, les vides augmentent et le temps d'entropie diminue. Atteindrez-vous la limite ?",
    shareMessage: "J'ai atteint le niveau {level} avec {score} points dans Grid Evolution!\nPlus grand bloc: {maxBlock}\nMouvements: {moves}",
    language: "Langue",
    reduceEffects: "Réduire les Effets",
    loadingText: "CHARGEMENT DE GRID EVOLUTION...",
    challengeMode: "DÉFI",
    selectStage: "SÉLECTIONNER NIVEAU",
    stageWord: "NIVEAU",
    returnToTree: "RETOUR A LA CARTE",
    backWord: "RETOUR",
    systemUpdateRequired: "MISE À JOUR SYSTÈME REQUISE",
    webviewWarningText: "Le moteur graphique de Grid Evolution nécessite une version plus récente d'Android System WebView. Veuillez le mettre à jour pour continuer à jouer.",
    updateWebviewBtn: "METTRE À JOUR WEBVIEW",
    resumeWord: "REPRENDRE"
  },
  ru: {
    score: "Счет",
    best: "Рекорд",
    undo: "Назад",
    hammer: "Молот",
    shuffle: "Перемешать",
    resetProgress: "Сбросить прогресс",
    howToPlay: "Как играть",
    wait: "Стоп!",
    areYouSureExit: "Вы уверены, что хотите выйти?",
    exitApp: "Выйти",
    keepPlaying: "Играть дальше",
    welcomeBack: "С возвращением",
    continueGame: "Продолжить",
    startNew: "Новая игра",
    rotateDevice: "Поверните экран",
    retry: "Повторить",
    shareResults: "Поделиться",
    back: "Назад",
    next: "Далее",
    start: "Старт",
    settings: "Настройки",
    sound: "Звук",
    haptics: "Вибрация",
    yes: "ДА",
    no: "НЕТ",
    areYouSure: "Вы уверены?",
    warningText: "Grid Evolution разработана для портретного режима. Пожалуйста, поверните ваше устройство.",
    recoveryText: "У вас есть незаконченная игра.<br/>Хотите продолжить?",
    evolutionHalted: "ЭВОЛЮЦИЯ ОСТАНОВЛЕНА",
    finalScore: "Финальный счет",
    largestBlock: "Лучший блок",
    totalMoves: "Всего ходов",
    efficiency: "Эффективность",
    longestCombo: "Лучшее комбо",
    evolutionLevel: "Уровень эволюции",
    newRecord: "Новый рекорд!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "УРОВЕНЬ ПОВЫШЕН: СЕТКА 5x5 РАЗБЛОКИРОВАНА!",
    levelUpUnlocked6x6: "УРОВЕНЬ ПОВЫШЕН: СЕТКА 6x6 РАЗБЛОКИРОВАНА!",
    levelReached: "УРОВЕНЬ {level} ДОСТИГНУТ!",
    step1Title: "ОСНОВНАЯ МЕХАНИКА",
    step1Desc: "Проведите пальцем, чтобы сдвинуть плитки. При столкновении двух плиток с одинаковым значением они ОБЪЕДИНЯЮТСЯ в одну с большим значением.",
    step2Title: "ЭНТРОПИЯ И РАСПАД",
    step2Desc: "ВНИМАНИЕ: ЭНТРОПИЯ! Если за 7 ходов не произошло ни одного слияния, ваша самая большая плитка теряет половину стоимости. Продолжайте ходить!",
    step3Title: "ВРЕМЕННЫЕ ПУСТОТЫ",
    step3Desc: "ВРЕМЕННЫЕ ПУСТОТЫ! Эти зоны появляются в центре сетки и мешают движению. Вы не сможете пройти, пока не истечет таймер.",
    step4Title: "РУЧНОЙ МОЛОТ",
    step4Desc: "СТРАТЕГИЧЕСКОЕ РЕШЕНИЕ! При полном заряде выберите молот и уничтожьте любую плитку на поле. Успешные ходы заряжают молот.",
    step5Title: "МАСШТАБНЫЙ ВЫЗОВ",
    step5Desc: "СЕТКА РАСШИРЯЕТСЯ! С ростом уровня поле увеличивается, пустот становится больше, а время энтропии сокращается. Дойдете до лимита?",
    shareMessage: "Я достиг уровня {level} с {score} очками в Grid Evolution!\nЛучший блок: {maxBlock}\nХодов: {moves}",
    language: "Язык",
    reduceEffects: "Уменьшить эффекты",
    loadingText: "ЗАГРУЗКА GRID EVOLUTION...",
    challengeMode: "ИСПЫТАНИЕ",
    selectStage: "ВЫБЕРИТЕ ЭТАП",
    stageWord: "ЭТАП",
    returnToTree: "ВЕРНУТЬСЯ НА КАРТУ",
    backWord: "НАЗАД",
    systemUpdateRequired: "ТРЕБУЕТСЯ ОБНОВЛЕНИЕ СИСТЕМЫ",
    webviewWarningText: "Графическому движку Grid Evolution требуется более новая версия Android System WebView. Пожалуйста, обновите ее для возобновления игры.",
    updateWebviewBtn: "ОБНОВИТЬ WEBVIEW",
    resumeWord: "ПРОДОЛЖИТЬ"
  },
  ar: {
    score: "النتيجة",
    best: "الأفضل",
    undo: "تراجع",
    hammer: "المطرقة",
    shuffle: "خلط",
    resetProgress: "إعادة تعيين التقدم",
    howToPlay: "كيفية اللعب",
    wait: "انتظر!",
    areYouSureExit: "هل أنت متأكد أنك تريد الخروج؟",
    exitApp: "الخروج من التطبيق",
    keepPlaying: "مواصلة اللعب",
    welcomeBack: "مرحباً بعودتك",
    continueGame: "مواصلة اللعبة",
    startNew: "بدء جديد",
    rotateDevice: "تدوير الجهاز",
    retry: "إعادة المحاولة",
    shareResults: "مشاركة النتائج",
    back: "السابق",
    next: "التالي",
    start: "ابدأ",
    settings: "الإعدادات",
    sound: "الصوت",
    haptics: "الاهتزاز",
    yes: "نعم",
    no: "لا",
    areYouSure: "هل أنت متأكد؟",
    warningText: "تم تصميم Grid Evolution لتلعب في الوضع العمودي. يرجى تدوير هاتفك للمتابعة.",
    recoveryText: "لديك لعبة غير مكتملة.<br/>هل تود الاستمرار؟",
    evolutionHalted: "توقف التطور",
    finalScore: "النتيجة النهائية",
    largestBlock: "أكبر كتلة",
    totalMoves: "إجمالي الحركات",
    efficiency: "الكفاءة",
    longestCombo: "أطول كومبو",
    evolutionLevel: "مستوى التطور",
    newRecord: "رقم قياسي جديد!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "ارتفع المستوى: تم فتح شبكة 5x5!",
    levelUpUnlocked6x6: "ارتفع المستوى: تم فتح شبكة 6x6!",
    levelReached: "تم الوصول إلى المستوى {level}!",
    step1Title: "الميكانيكية الأساسية",
    step1Desc: "اسحب لتحريك جميع البلاطات. عندما تصطدم بلاطتان بنفس القيمة، تندمجان في بلاطة واحدة بقيمة أعلى لتطوير الشبكة.",
    step2Title: "القصور الذاتي والتدهور",
    step2Desc: "تنبيه القصور! إذا لم يحدث أي اندماج خلال 7 حركات (تقل مع ارتفاع مستواك)، تفقد البlaطة الأعلى نصف قيمتها. استمر في التحرك!",
    step3Title: "الفراغات الزمنية",
    step3Desc: "الفراغات الزمنية! تظهر هذه المناطق في وسط الشبكة وتحد من حركاتك. لا يمكنك المرور من خلالها حتى ينتهي الموقت.",
    step4Title: "المطرقة اليدوية",
    step4Desc: "التدخل الاستراتيجي! عند شحنها بالكامل، اختر المطرقة ودمر أي بلاطة على الشبكة. الحركات الناجحة تشحن المطرقة.",
    step5Title: "تحدي التوسع",
    step5Desc: "الشبكة تتوسع! مع ارتفاع مستواك، تكبر المساحة، وتزداد الفراغات، ويقل وقت القصور الذاتي. هل يمكنك الوصول إلى الحد الأقصى؟",
    shareMessage: "لقد وصلت إلى المستوى {level} بـ {score} نقطة في Grid Evolution!\nأكبر كتلة: {maxBlock}\nالحركات: {moves}",
    language: "اللغة",
    reduceEffects: "تقليل المؤثرات",
    loadingText: "جاري التحميل...",
    challengeMode: "التحدي",
    selectStage: "اختر المرحلة",
    stageWord: "المرحلة",
    returnToTree: "العودة إلى الخريطة",
    backWord: "رجوع",
    systemUpdateRequired: "مطلوب تحديث النظام",
    webviewWarningText: "يتطلب محرك رسوميات Grid Evolution إصداراً أحدث من Android System WebView. يرجى التحديث لمتابعة اللعب.",
    updateWebviewBtn: "تحديث WEBVIEW",
    resumeWord: "استئناف"
  },
  de: {
    score: "Ergebnis",
    best: "Rekord",
    undo: "Zurück",
    hammer: "Hammer",
    shuffle: "Mischen",
    resetProgress: "Zurücksetzen",
    howToPlay: "Anleitung",
    wait: "Warten!",
    areYouSureExit: "Möchten Sie wirklich beenden?",
    exitApp: "App beenden",
    keepPlaying: "Weiterspielen",
    welcomeBack: "Willkommen zurück",
    continueGame: "Spiel fortsetzen",
    startNew: "Neu starten",
    rotateDevice: "Gerät drehen",
    retry: "Wiederholen",
    shareResults: "Teilen",
    back: "Zurück",
    next: "Weiter",
    start: "Start",
    settings: "Optionen",
    sound: "Ton",
    haptics: "Vibration",
    yes: "JA",
    no: "NEIN",
    areYouSure: "Sind Sie sicher?",
    warningText: "Grid Evolution ist für das Hochformat gedacht. Bitte drehen Sie Ihr Gerät, um fortzufahren.",
    recoveryText: "Sie haben ein unvollendetes Spiel.<br/>Möchten Sie es fortsetzen?",
    evolutionHalted: "EVOLUTION BEENDET",
    finalScore: "Endstand",
    largestBlock: "Größter Block",
    totalMoves: "Züge gesamt",
    efficiency: "Effizienz",
    longestCombo: "Längste Combo",
    evolutionLevel: "Evolutionsstufe",
    newRecord: "Neuer Rekord!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "LEVEL UP: 5x5 FELD FREIGESCHALTET!",
    levelUpUnlocked6x6: "LEVEL UP: 6x6 FELD FREIGESCHALTET!",
    levelReached: "LEVEL {level} ERREICHT!",
    step1Title: "DIE BASIS-MECHANIK",
    step1Desc: "Wischen Sie, um Kacheln zu bewegen. Wenn zwei gleiche Kacheln kollidieren, VERSCHMELZEN sie zu einer Kachel mit höherem Wert, um das Spielfeld zu entwickeln.",
    step2Title: "ENTROPIE & VERFALL",
    step2Desc: "ENTROPIE-ALARM! Wenn 7 Züge lang keine Kacheln verschmelzen (sinkt je Level), verliert Ihre höchste Kachel die Hälfte ihres Wertes. Bleiben Sie in Bewegung!",
    step3Title: "ZEITLICHE LEEREN",
    step3Desc: "ZEITLICHE LEEREN! Diese Zonen erscheinen in der Mitte des Feldes und blockieren Züge. Sie können sie erst passieren, wenn der Timer abläuft.",
    step4Title: "DER MANUELLE HAMMER",
    step4Desc: "STRATEGISCHER EINGRIFF! Wenn der Hammer geladen ist, wählen Sie ihn aus und zerstören Sie eine beliebige Kachel. Erfolgreiche Züge laden den Hammer auf.",
    step5Title: "SKALIERUNGS-CHALLENGE",
    step5Desc: "DAS SPIELFELD WÄCHST! Mit höheren Levels wird das Feld größer, die Leeren nehmen zu und die Entropie-Zeit sinkt. Erreichen Sie das Limit?",
    shareMessage: "Ich habe Level {level} mit {score} Punkten in Grid Evolution erreicht!\nGrößter Block: {maxBlock}\nZüge: {moves}",
    language: "Sprache",
    reduceEffects: "Effekte Reduzieren",
    loadingText: "GRID EVOLUTION WIRD GELADEN...",
    challengeMode: "HERAUSFORDERUNG",
    selectStage: "STUFE WÄHLEN",
    stageWord: "STUFE",
    returnToTree: "ZURÜCK ZUR KARTE",
    backWord: "ZURÜCK",
    systemUpdateRequired: "SYSTEMAKTUALISIERUNG ERFORDERLICH",
    webviewWarningText: "Die Grafik-Engine von Grid Evolution erfordert ein neueres Android System WebView. Bitte aktualisieren Sie es, um weiterzuspielen.",
    updateWebviewBtn: "WEBVIEW AKTUALISIEREN",
    resumeWord: "FORTSETZEN"
  },
  pt: {
    score: "Pontos",
    best: "Recorde",
    undo: "Desfazer",
    hammer: "Martelo",
    shuffle: "Embaralhar",
    resetProgress: "Redefinir Progresso",
    howToPlay: "Como Jogar",
    wait: "Espere!",
    areYouSureExit: "Tem certeza de que deseja sair?",
    exitApp: "Sair do App",
    keepPlaying: "Continuar Jogando",
    welcomeBack: "Bem-vindo de Volta",
    continueGame: "Continuar Jogo",
    startNew: "Iniciar Novo",
    rotateDevice: "Rotacionar Dispositivo",
    retry: "Repetir",
    shareResults: "Compartilhar",
    back: "Voltar",
    next: "Avançar",
    start: "Iniciar",
    settings: "Ajustes",
    sound: "Som",
    haptics: "Vibração",
    yes: "SIM",
    no: "NÃO",
    areYouSure: "Tem certeza?",
    warningText: "Grid Evolution foi projetado para o modo retrato. Rotacione seu celular para continuar.",
    recoveryText: "Você tem um jogo inacabado.<br/>Gostaria de continuar?",
    evolutionHalted: "EVOLUÇÃO PARADA",
    finalScore: "Pontuação Final",
    largestBlock: "Maior Bloco",
    totalMoves: "Movimentos Totais",
    efficiency: "Eficiência",
    longestCombo: "Maior Combo",
    evolutionLevel: "Nível de Evolução",
    newRecord: "Novo Recorde!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "LEVEL UP: GRADE 5x5 DESBLOQUEADA!",
    levelUpUnlocked6x6: "LEVEL UP: GRADE 6x6 DESBLOQUEADA!",
    levelReached: "NÍVEL {level} ALCANÇADO!",
    step1Title: "A MECÂNICA CENTRAL",
    step1Desc: "Deslize para mover os blocos. Quando dois blocos do mesmo valor colidem, eles se FUNDEM em um único bloco de valor maior para evoluir a grade.",
    step2Title: "ENTROPIA E DEGRADACAO",
    step2Desc: "ALERTA DE ENTROPIA! Se nenhuma fusão ocorrer em 7 movimentos (diminui conforme sobe de nível), seu maior bloco perde metade do valor. Continue se movendo!",
    step3Title: "VAZIOS TEMPORAIS",
    step3Desc: "VAZIOS TEMPORAIS! Estas áreas surgem no centro da grade e limitam seus movimentos. Você não poderá passar até que o cronômetro acabe.",
    step4Title: "O MARTELO MANUAL",
    step4Desc: "INTERVENÇÃO ESTRATÉGICA! Quando estiver carregado, selecione o martelo e destrua qualquer bloco na grade. Movimentos bem-sucedidos o carregam.",
    step5Title: "DESAFIO EM ESCALA",
    step5Desc: "A GRADE EXPANDE! Conforme sobe de nível, o espaço grows, os vazios aumentam e o tempo de entropia diminui. Consegue alcançar o limite?",
    shareMessage: "Alcancei o nível {level} com {score} pontos no Grid Evolution!\nMaior bloco: {maxBlock}\nMovimentos: {moves}",
    language: "Idioma",
    reduceEffects: "Reduzir Efeitos",
    loadingText: "CARREGANDO GRID EVOLUTION...",
    challengeMode: "DESAFIO",
    selectStage: "SELECIONAR FASE",
    stageWord: "FASE",
    returnToTree: "VOLTAR AO MAPA",
    backWord: "VOLTAR",
    systemUpdateRequired: "ATUALIZAÇÃO DE SISTEMA NECESSÁRIA",
    webviewWarningText: "O motor gráfico do Grid Evolution requer um Android System WebView mais recente. Atualize-o para continuar jogando.",
    updateWebviewBtn: "ATUALIZAR WEBVIEW",
    resumeWord: "RETOMAR"
  },
  ja: {
    score: "スコア",
    best: "ベスト",
    undo: "戻す",
    hammer: "ハンマー",
    shuffle: "シャッフル",
    resetProgress: "進行状況リセット",
    howToPlay: "遊び方",
    wait: "お待ちください！",
    areYouSureExit: "本当に終了しますか？",
    exitApp: "アプリを終了",
    keepPlaying: "プレイを続ける",
    welcomeBack: "おかえりなさい",
    continueGame: "ゲームを再開",
    startNew: "新しく始める",
    rotateDevice: "画面を回転してください",
    retry: "もう一度",
    shareResults: "結果をシェア",
    back: "戻る",
    next: "次へ",
    start: "スタート",
    settings: "設定",
    sound: "サウンド",
    haptics: "バイブレーション",
    yes: "はい",
    no: "いいえ",
    areYouSure: "よろしいですか？",
    warningText: "Grid Evolutionは縦画面専用です。スマートフォンを縦向きにしてください。",
    recoveryText: "中断されたゲームがあります。<br/>再開しますか？",
    evolutionHalted: "進化停止",
    finalScore: "最終スコア",
    largestBlock: "最大ブロック",
    totalMoves: "총 이동 수",
    efficiency: "効率性",
    longestCombo: "最長コンボ",
    evolutionLevel: "進化レベル",
    newRecord: "新記録！",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "レベルアップ：5x5グリッド解放！",
    levelUpUnlocked6x6: "レベルアップ：6x6グリッド解放！",
    levelReached: "レベル {level} 到達！",
    step1Title: "基本ルール",
    step1Desc: "スワイプしてタイルをスライドさせます。同じ数値のタイルが衝突すると合体し、より高い数値の1つのタイルに進化します。",
    step2Title: "エントロピーと劣化",
    step2Desc: "エントロピー警告！合体が7回（レベルアップで減少）発生しないと、最大数値のタイルが半減します。動き続けましょう！",
    step3Title: "時空の裂け目",
    step3Desc: "時空의 裂け目！グリッドの中央に現れるこのエリアは侵入不可能です。タイマーがゼロになるまで通過できません。",
    step4Title: "マニュアルハンマー",
    step4Desc: "戦略的介入！フルチャージ時にハンマーを選択して、グリッド上の任意のタイルを破壊できます。移動に成功するとチャージされます。",
    step5Title: "拡大する挑戦",
    step5Desc: "グリッドが拡大！レベルが上がると面積が増え、裂け目が増加し、エントロピー猶予時間が短縮されます。限界へ到達できますか？",
    shareMessage: "Grid Evolutionでレベル {level} に到達、スコア {score} を達成しました！\n最大ブロック: {maxBlock}\n移動数: {moves}",
    language: "言語",
    reduceEffects: "エフェクト軽減",
    loadingText: "GRID EVOLUTION 読み込み中...",
    challengeMode: "チャレンジ",
    selectStage: "ステージ選択",
    stageWord: "ステージ",
    returnToTree: "マップに戻る",
    backWord: "戻る",
    systemUpdateRequired: "システムアップデートが必要です",
    webviewWarningText: "Grid Evolutionのグラフィックエンジンには、より新しいAndroid System WebViewが必要です。プレイを再開するにはアップデートしてください。",
    updateWebviewBtn: "WEBVIEWをアップデート",
    resumeWord: "再開"
  },
  zh: {
    score: "得分",
    best: "历史最高",
    undo: "撤销",
    hammer: "锤子",
    shuffle: "打乱",
    resetProgress: "重置进度",
    howToPlay: "玩法介绍",
    wait: "请稍等！",
    areYouSureExit: "您确定要退出吗？",
    exitApp: "退出应用",
    keepPlaying: "继续游戏",
    welcomeBack: "欢迎回来",
    continueGame: "继续游戏",
    startNew: "开始新游戏",
    rotateDevice: "旋转设备",
    retry: "重试",
    shareResults: "分享结果",
    back: "返回",
    next: "下一步",
    start: "开始",
    settings: "设置",
    sound: "声音",
    haptics: "触感反馈",
    yes: "是",
    no: "否",
    areYouSure: "您确定吗？",
    warningText: "Grid Evolution 设计在竖屏下运行。请将手机旋转为竖屏以继续。",
    recoveryText: "您有未完成的游戏。<br/>是否继续？",
    evolutionHalted: "进化终止",
    finalScore: "最终得分",
    largestBlock: "最大方块",
    totalMoves: "总移动步数",
    efficiency: "效率",
    longestCombo: "最长连击",
    evolutionLevel: "进化等级",
    newRecord: "新纪录！",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "等级提升：解锁 5x5 网格！",
    levelUpUnlocked6x6: "等级提升：解锁 6x6 网格！",
    levelReached: "达到等级 {level}！",
    step1Title: "核心玩法",
    step1Desc: "滑动以滑动所有方块。当两个具有相同数值的方块发生碰撞时，它们会合并成一个更高数值的方块以完成进化。",
    step2Title: "熵增与衰退",
    step2Desc: "熵增警报！如果连续7步没有发生合并（随着等级提升步数会减少），您最大数值 of 方块将减半。保持移动！",
    step3Title: "时空虚空",
    step3Desc: "时空虚空！这些出现在网格中心的区域会限制您的移动。在计时器归零之前，您无法通过 these 区域。",
    step4Title: "手动重锤",
    step4Desc: "战略干预！当重锤充满电时，选择并击碎网格上的任意方块。成功的移动会为重锤充电。",
    step5Title: "网格扩张挑战",
    step5Desc: "网格在扩张！随着等级提升，区域变大，虚空增多，且熵增宽限时间变短。您能挑战到极限吗？",
    shareMessage: "我在 Grid Evolution 中达到了等级 {level} 并获得了 {score} 分！\n最大方块: {maxBlock}\n移动步数: {moves}",
    language: "语言",
    reduceEffects: "减少效果",
    loadingText: "正在加载 GRID EVOLUTION...",
    challengeMode: "挑战",
    selectStage: "选择关卡",
    stageWord: "关卡",
    returnToTree: "返回地图",
    backWord: "返回",
    systemUpdateRequired: "需要系统更新",
    webviewWarningText: "Grid Evolution的图形引擎需要较新版本的 Android System WebView。请更新以继续游戏。",
    updateWebviewBtn: "更新 WEBVIEW",
    resumeWord: "继续"
  },
  pl: {
    score: "Wynik",
    best: "Najlepszy",
    undo: "Cofnij",
    hammer: "Młotek",
    shuffle: "Tasuj",
    resetProgress: "Resetuj postęp",
    howToPlay: "Jak grać",
    wait: "Czekaj!",
    areYouSureExit: "Czy na pewno chcesz wyjść?",
    exitApp: "Zamknij grę",
    keepPlaying: "Graj dalej",
    welcomeBack: "Witaj z powrotem",
    continueGame: "Kontynuuj grę",
    startNew: "Nowa gra",
    rotateDevice: "Obróć urządzenie",
    retry: "Spróbuj ponownie",
    shareResults: "Udostępnij wyniki",
    back: "Wstecz",
    next: "Dalej",
    start: "Start",
    settings: "Ustawienia",
    sound: "Dźwięk",
    haptics: "Wibracje",
    yes: "TAK",
    no: "NIE",
    areYouSure: "Czy na pewno?",
    warningText: "Grid Evolution została zaprojektowana do grania w trybie pionowym. Obróć telefon, aby kontynuować.",
    recoveryText: "Masz niedokończoną grę.<br/>Czy chcesz ją kontynuować?",
    evolutionHalted: "EWOLUCJA WSTRZYMANA",
    finalScore: "Wynik końcowy",
    largestBlock: "Największy blok",
    totalMoves: "Liczba ruchów",
    efficiency: "Wydajność",
    longestCombo: "Najdłuższe kombo",
    evolutionLevel: "Poziom ewolucji",
    newRecord: "Nowy rekord!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "POZIOM W GÓRĘ: ODBLOKOWANO SIATKĘ 5x5!",
    levelUpUnlocked6x6: "POZIOM W GÓRĘ: ODBLOKOWANO SIATKĘ 6x6!",
    levelReached: "POZIOM {level} OSIĄGNIĘTY!",
    step1Title: "GŁÓWNA MECHANIKA",
    step1Desc: "Przesuwaj palcem, aby przesuwać wszystkie kafelki. Gdy zderzą się dwa kafelki o tej samej wartości, ŁĄCZĄ SIĘ w jeden o wyższej wartości, aby ewoluować siatkę.",
    step2Title: "ENTROPIA I DEGRADACJA",
    step2Desc: "ALERT ENTROPII! Jeśli w ciągu 7 ruchów (zmniejsza się wraz z poziomem) nie dojdzie do połączenia, Twój najwyższy kafelek traci połowę swojej wartości. Ruszaj się!",
    step3Title: "PUSTKI CZASOWE",
    step3Desc: "PUSTKI CZASOWE! Te obszary pojawiające się na środku siatki ograniczają Twoje ruchy. Nie możesz przez nie przejść, dopóki licznik czasu nie dojdzie do zera.",
    step4Title: "RĘCZNY MŁOTEK",
    step4Desc: "STRATEGICZNA INTERWENCJA! Po pełnym naładowaniu wybierz młotek i zniszcz dowolny kafelek na siatce. Udane ruchy ładują młotek.",
    step5Title: "ROSNĄCE WYZWANIE",
    step5Desc: "SIATKA SIĘ POWIĘKSZA! W miarę zdobywania kolejnych poziomów obszar gry rośnie, pojawia się więcej pustek, a czas na reakcję entropii się kurczy. Czy zdołasz osiągnąć limit?",
    shareMessage: "Osiągnąłem poziom {level} z wynikiem {score} w Grid Evolution!\nNajwiększy blok: {maxBlock}\nRuchy: {moves}",
    language: "Język",
    reduceEffects: "Ogranicz Efekty",
    loadingText: "ŁADOWANIE GRID EVOLUTION...",
    challengeMode: "WYZWANIE",
    selectStage: "WYBIERZ ETAP",
    stageWord: "ETAP",
    returnToTree: "POWRÓT DO MAPY",
    backWord: "WSTECZ",
    systemUpdateRequired: "WYMAGANA AKTUALIZACJA SYSTEMU",
    webviewWarningText: "Silnik graficzny Grid Evolution wymaga nowszej wersji Android System WebView. Zaktualizuj go, aby wznowić grę.",
    updateWebviewBtn: "ZAKTUALIZUJ WEBVIEW",
    resumeWord: "WZNÓW"
  },
  it: {
    score: "Punteggio",
    best: "Migliore",
    undo: "Annulla",
    hammer: "Martello",
    shuffle: "Mischia",
    resetProgress: "Azzera Progressi",
    howToPlay: "Come Giocare",
    wait: "Aspetta!",
    areYouSureExit: "Sei sicuro di voler uscire?",
    exitApp: "Esci dall'App",
    keepPlaying: "Continua a Giocare",
    welcomeBack: "Bentornato",
    continueGame: "Continua Partita",
    startNew: "Nuova Partita",
    rotateDevice: "Ruota il Dispositivo",
    retry: "Riprova",
    shareResults: "Condividi Risultati",
    back: "Indietro",
    next: "Avanti",
    start: "Inizia",
    settings: "Impostazioni",
    sound: "Suono",
    haptics: "Vibrazione",
    yes: "SÌ",
    no: "NO",
    areYouSure: "Sei sicuro?",
    warningText: "Grid Evolution è progettato per essere giocato in modalità ritratto. Ruota il telefono per continuare.",
    recoveryText: "Hai una partita non terminata.<br/>Vuoi continuarla?",
    evolutionHalted: "EVOLUZIONE INTERROTTA",
    finalScore: "Punteggio Finale",
    largestBlock: "Blocco Più Grande",
    totalMoves: "Mosse Totali",
    efficiency: "Efficienza",
    longestCombo: "Combo Più Lunga",
    evolutionLevel: "Livello Evoluzione",
    newRecord: "Nuovo Record!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "LIVELLO SU: GRIGLIA 5x5 SBLOCCATA!",
    levelUpUnlocked6x6: "LIVELLO SU: GRIGLIA 6x6 SBLOCCATA!",
    levelReached: "LIVELLO {level} RAGGIUNTO!",
    step1Title: "MECCANICA DI BASE",
    step1Desc: "Scorri per muovere tutte le tessere. Quando due tessere con lo stesso valore si scontrano, si FONDONO in una singola tessera di valore superiore per far evolvere la griglia.",
    step2Title: "ENTROPIA E DEGRADAZIONE",
    step2Desc: "ALLERTA ENTROPIA! Se non avvengono fusioni per 7 mosse (diminuiscono salendo di livello), la tessera più alta perde metà del suo valore. Continua a muoverti!",
    step3Title: "VUOTI TEMPORALI",
    step3Desc: "VUOTI TEMPORALI! Queste aree che appaiono al centro della griglia limitano i tuoi movimenti. Non potrai passarci finché il timer non scade.",
    step4Title: "IL MARTELLO MANUALE",
    step4Desc: "INTERVENTO STRATEGICO! Quando è completamente carico, seleziona il martello e distruggi qualsiasi tessera sulla griglia. Le mosse riuscite caricano il martello.",
    step5Title: "SFIDA IN SCALA",
    step5Desc: "LA GRIGLIA SI ESPANDE! Salendo di livello, l'area di gioco cresce, i vuoti aumentano e il tempo di entropia diminuisce. Riuscirai a raggiungere il limite?",
    shareMessage: "Ho raggiunto il Livello {level} con {score} punti in Grid Evolution!\nBlocco più grande: {maxBlock}\nMosse: {moves}",
    language: "Lingua",
    reduceEffects: "Riduci Effetti",
    loadingText: "CARICAMENTO GRID EVOLUTION...",
    challengeMode: "SFIDA",
    selectStage: "SELEZIONA LIVELLO",
    stageWord: "LIVELLO",
    returnToTree: "TORNA ALLA MAPPA",
    backWord: "INDIETRO",
    systemUpdateRequired: "AGGIORNAMENTO DI SISTEMA RICHIESTO",
    webviewWarningText: "Il motore grafico di Grid Evolution richiede un Android System WebView più recente. Si prega di aggiornarlo per riprendere a giocare.",
    updateWebviewBtn: "AGGIORNA WEBVIEW",
    resumeWord: "RIPRENDI"
  },
  ko: {
    score: "점수",
    best: "최고 점수",
    undo: "되돌리기",
    hammer: "망치",
    shuffle: "섞기",
    resetProgress: "진행 상황 초기화",
    howToPlay: "게임 방법",
    wait: "잠깐만요!",
    areYouSureExit: "정말로 종료하시겠습니까?",
    exitApp: "앱 종료",
    keepPlaying: "계속 플레이",
    welcomeBack: "다시 오신 것을 환영합니다",
    continueGame: "게임 이어하기",
    startNew: "새 게임 시작",
    rotateDevice: "기기 회전",
    retry: "다시 시도",
    shareResults: "결과 공유",
    back: "이전",
    next: "다음",
    start: "시작",
    settings: "설정",
    sound: "소리",
    haptics: "진동",
    yes: "예",
    no: "아니오",
    areYouSure: "확실합니까?",
    warningText: "Grid Evolution은 세로 모드 전용으로 설계되었습니다. 계속하려면 휴대폰을 세로로 회전해 주세요.",
    recoveryText: "진행 중이던 게임이 있습니다.<br/>계속하시겠습니까?",
    evolutionHalted: "진화 중단",
    finalScore: "최종 점수",
    largestBlock: "가장 큰 블록",
    totalMoves: "총 이동 횟수",
    efficiency: "효율성",
    longestCombo: "최장 콤보",
    evolutionLevel: "진화 레벨",
    newRecord: "새로운 기록!",
    double: "DOUBLE",
    triple: "TRIPLE",
    quadruple: "QUADRUPLE",
    penta: "PENTA",
    hexa: "HEXA EVOLUTION",
    levelUpUnlocked5x5: "레벨 업: 5x5 그리드 해제!",
    levelUpUnlocked6x6: "레벨 업: 6x6 그리드 해제!",
    levelReached: "레벨 {level} 도달!",
    step1Title: "핵심 메커니즘",
    step1Desc: "화면을 쓸어넘겨 모든 타일을 미십시오. 같은 값을 가진 두 타일이 충돌하면 하나로 합쳐져 더 높은 가치의 타일로 진화합니다.",
    step2Title: "엔트로피와 기능 저하",
    step2Desc: "엔트로피 경고! 7회 이동 동안 합치기가 일어나지 않으면(레벨이 올라갈수록 제한 횟수가 감소) 가장 높은 타일의 가치가 절반으로 떨어집니다. 계속 움직이십시오!",
    step3Title: "시간의 공백",
    step3Desc: "시간의 공백! 그리드 중앙에 나타나는 이 공백 영역들은 이동을 제한합니다. 타이머가 다 될 때까지 통과할 수 없습니다.",
    step4Title: "수동 망치",
    step4Desc: "전략적 개입! 망치가 완전히 충전되면 이를 선택하여 그리드 위의 원하는 타일을 파괴할 수 있습니다. 이동에 성공할 때마다 망치가 충전됩니다.",
    step5Title: "확장되는 도전",
    step5Desc: "그리드 확장! 레벨이 높아질수록 그리드가 커지고 공백이 늘어나며 엔트로피 유예 시간이 짧아집니다. 한계에 도전해 보십시오!",
    shareMessage: "Grid Evolution에서 {score}점으로 레벨 {level}에 도달했습니다!\n가장 큰 블록: {maxBlock}\n이동 수: {moves}",
    language: "언어",
    reduceEffects: "효과 줄이기",
    loadingText: "GRID EVOLUTION 로딩 중...",
    challengeMode: "챌린지",
    selectStage: "스테이지 선택",
    stageWord: "스테이지",
    returnToTree: "지도로 돌아가기",
    backWord: "뒤로",
    systemUpdateRequired: "시스템 업데이트 필요",
    webviewWarningText: "Grid Evolution의 그래픽 엔진에는 최신 Android System WebView가 필요합니다. 플레이를 재개하려면 업데이트해 주세요.",
    updateWebviewBtn: "WEBVIEW 업데이트",
    resumeWord: "재개"
  }
};

const detectedLang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
const defaultLang = TRANSLATIONS[detectedLang] ? detectedLang : 'en';

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
  2: { bg: '#FFD8CC', text: '#5D2510' },
  4: { bg: '#C8E6C9', text: '#1B5E20' },
  8: { bg: '#B3E5FC', text: '#0D47A1' },
  16: { bg: '#E1BEE7', text: '#4A148C' },
  32: { bg: '#F8BBD0', text: '#880E4F' },
  64: { bg: '#FFAB91', text: '#BF360C' },
  128: { bg: '#80DEEA', text: '#006064' },
  256: { bg: '#CE93D8', text: '#4A148C' },
  512: { bg: '#80CBC4', text: '#004D40' },
  1024: { bg: '#9FA8DA', text: '#1A237E' },
  2048: { bg: '#FFE082', text: '#FF6F00' }
};

const getTileStyle = (val: number) => TILE_STYLES[val] || { bg: '#EEEEEE', text: '#424242' };

// --- Memoized Sub-Components ---

const SHADOW_PRESETS = {
  ghost: 'none',
  lowPerf: 'none',
  targetable: '0 0 15px #6366F1, inset 0 0 10px rgba(99, 102, 241, 0.5)',
  levelUp: '0 0 30px 10px #6366F1, inset 0 0 15px #6366F1',
  voidCenter: 'inset 0 0 20px rgba(156, 163, 175, 0.4), 0 0 25px 8px rgba(156, 163, 175, 0.5)',
  voidEdge: 'inset 0 0 20px rgba(156, 163, 175, 0.4), 0 0 15px rgba(156, 163, 175, 0.6)',
  tier2: 'inset 0 0 10px rgba(255,255,255,0.5), 0 0 0 1px #6366F1, 0 8px 16px rgba(0,0,0,0.5)',
  base: 'inset 0 0 8px rgba(255,255,255,0.1), 0 8px 16px rgba(0,0,0,0.3)'
};

const TileComponent = memo(({ 
  tile, 
  gridSize, 
  tileSizePercent, 
  levelUpTrigger,
  isHammerActive,
  onClick,
  lowPerformanceMode,
  gameOver
}: { 
  tile: TileConfig, 
  gridSize: number, 
  tileSizePercent: string, 
  levelUpTrigger: number,
  isHammerActive?: boolean,
  onClick?: (id: string) => void,
  lowPerformanceMode?: boolean,
  gameOver?: boolean
}) => {
  const style = useMemo(() => getTileStyle(tile.value), [tile.value]);
  const isCenterVoid = tile.isVoid && tile.row > 0 && tile.row < gridSize - 1 && tile.col > 0 && tile.col < gridSize - 1;
  const isTargetable = isHammerActive && !tile.isVoid;

  const isTier2 = !tile.isVoid && tile.value >= 64 && tile.value <= 256;
  const isTier3 = !tile.isVoid && tile.value >= 512 && tile.value <= 1024;
  const isTier4 = !tile.isVoid && tile.value >= 2048;

  const fontWeightClass = useMemo(() => {
    if (tile.isVoid) return 'font-[100]';
    if (tile.value <= 32) return 'font-normal';
    if (tile.value <= 256) return 'font-medium';
    return 'font-semibold';
  }, [tile.value, tile.isVoid]);

  const boxShadow = useMemo(() => {
    if (tile.isGhost) return SHADOW_PRESETS.ghost;
    if (lowPerformanceMode) return SHADOW_PRESETS.lowPerf;
    if (isTargetable) return SHADOW_PRESETS.targetable;
    if (levelUpTrigger > 0) return SHADOW_PRESETS.levelUp;
    if (tile.isVoid) return isCenterVoid ? SHADOW_PRESETS.voidCenter : SHADOW_PRESETS.voidEdge;
    if (isTier4) return `inset 0 0 20px rgba(255,255,255,0.8), 0 0 40px ${style.bg}`;
    if (isTier3) return `inset 0 0 15px rgba(255,255,255,0.4), 0 0 20px ${style.bg}80`;
    if (isTier2) return SHADOW_PRESETS.tier2;
    return SHADOW_PRESETS.base;
  }, [tile.isGhost, lowPerformanceMode, isTargetable, levelUpTrigger, tile.isVoid, isCenterVoid, isTier4, isTier3, isTier2, style.bg]);
  const activeShadow = tile.hasMoved ? 'none' : boxShadow;

  const backgroundStyles = useMemo(() => {
    if (lowPerformanceMode) {
      return {
        backgroundColor: '#050505',
        color: tile.isVoid ? '#A855F7' : style.text,
        border: '2px solid rgba(168, 85, 247, 0.8)',
        boxShadow: 'none',
        mixBlendMode: 'normal' as const,
        backgroundImage: 'none'
      };
    }
    
    const base: React.CSSProperties = {
        backgroundColor: tile.isVoid ? 'transparent' : style.bg,
        color: tile.isVoid ? '#E5E7EB' : style.text,
    };
    if (tile.isVoid) {
        base.background = 'radial-gradient(circle at center, #0a0a0a 0%, #151515 100%)';
    } else if (isTier3 && !tile.isGhost && !lowPerformanceMode) {
        base.background = `linear-gradient(135deg, ${style.bg} 0%, ${style.bg} 40%, rgba(255,255,255,0.8) 50%, ${style.bg} 60%, ${style.bg} 100%)`;
        base.backgroundSize = '200% 200%';
    }
    return base;
  }, [tile.value, tile.isVoid, tile.isGhost, isTier3, style.bg, style.text, lowPerformanceMode]);

  const calculatedX = useMemo(() => `calc(((100% + 12px) / ${gridSize}) * ${tile.col})`, [gridSize, tile.col]);
  const calculatedY = useMemo(() => `calc(((100% + 12px) / ${gridSize}) * ${tile.row})`, [gridSize, tile.row]);
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
          scale: (tile.isVoid && !lowPerformanceMode) ? [1, 1.05, 1] : 1,
          opacity: tile.isGhost ? 0.55 : 1,
          z: 0
      }}
      exit={tile.isGhost ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0 }}
      transition={lowPerformanceMode ? {
          left: { type: "tween", duration: 0.05 },
          top: { type: "tween", duration: 0.05 },
          scale: { duration: 0 },
          opacity: { duration: 0 }
      } : {
          left: { type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.15 },
          top: { type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.15 },
          scale: tile.isVoid ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : (tile.isNew ? { type: "spring", stiffness: 400, damping: 22, mass: 0.8 } : (tile.isMerged ? { type: "spring", stiffness: 350, damping: 20, mass: 0.8 } : { type: "tween", ease: [0.4, 0, 0.2, 1], duration: 0.15 })),
          opacity: { duration: 0.1 }
      }}
      onClick={() => { if (isTargetable && onClick) onClick(tile.id); }}
      className={`absolute flex items-center justify-center rounded-xl sm:rounded-[1.5rem] ${fontWeightClass} transform-gpu overflow-hidden ${tile.value >= 64 ? 'z-[25]' : ''} ${isTargetable ? 'cursor-pointer hover:scale-[1.02] ring-2 ring-[#6366F1] pointer-events-auto' : ''} ${tile.isGhost ? 'border-2 border-dashed border-white/50 pointer-events-none z-[45]' : ''}`}
      style={{
          width: tileSizePercent,
          height: tileSizePercent,
          boxShadow: activeShadow,
          zIndex: finalZIndex,
          fontSize: tile.isVoid ? safeClamp('1.5rem', '5vw', '2rem') : (tile.value > 999
                    ? (gridSize >= 6 ? safeClamp('0.8rem', '2.5vw', '1.1rem') : gridSize >= 5 ? safeClamp('0.9rem', '3vw', '1.3rem') : safeClamp('1rem', '3.5vw', '1.5rem')) 
                    : (gridSize >= 6 ? safeClamp('1rem', '3.5vw', '1.3rem') : gridSize >= 5 ? safeClamp('1.2rem', '4vw', '1.6rem') : safeClamp('1.3rem', '5vw', '2rem'))),
          border: tile.isGhost ? '2px dashed rgba(255,255,255,0.4)' : (tile.isVoid ? '2px solid #9CA3AF' : (levelUpTrigger > 0 ? '1px solid #6366F1' : 'none')),
          ...backgroundStyles
      }}
    >
      {isTier4 && !tile.isGhost && !lowPerformanceMode && (
          <motion.div
             animate={{ rotate: 360 }}
             transition={{ 
                rotate: { duration: 10, repeat: Infinity, ease: "linear" }
             }}
             className="absolute inset-0 z-0 origin-center mix-blend-overlay opacity-80"
             style={{
                 willChange: 'transform',
                 background: `conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)`
             }}
          />
      )}
      
      {tile.isNew && !tile.isGhost && !lowPerformanceMode && (
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
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg 
                  className={`w-4/5 h-4/5 text-white absolute ${(lowPerformanceMode || levelUpTrigger > 0 || gameOver) ? '' : 'animate-spin'}`} 
                  viewBox="0 0 100 100" 
                  style={{ animationDuration: '24s', opacity: 0.08, willChange: 'transform' }}
              >
                  <circle 
                      cx="50" 
                      cy="50" 
                      r="40" 
                      stroke="currentColor" 
                      strokeWidth="1.5" 
                      fill="none" 
                      strokeDasharray="40 10 90 20 15 15" 
                      strokeLinecap="round" 
                  />
                  <circle 
                      cx="50" 
                      cy="50" 
                      r="30" 
                      stroke="currentColor" 
                      strokeWidth="1" 
                      fill="none" 
                      strokeDasharray="15 30 10 40" 
                      strokeLinecap="round" 
                      style={{ transformOrigin: 'center', transform: 'rotate(-45deg)' }}
                  />
              </svg>
              <span className="relative z-30 font-[100] tracking-tighter" style={{ textShadow: '0 0 12px rgba(255,255,255,0.4)' }}>
                  {tile.voidMoves}
              </span>
          </div>
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
           prev.onClick === next.onClick &&
           prev.lowPerformanceMode === next.lowPerformanceMode &&
           prev.gameOver === next.gameOver;
});

const Header = memo(({ score, highScore, scoreMultiplier, onOpenSettings, t, gameMode, movesLeft, maxBlock, gameOver, challengeLevel, currentTarget }: { score: number, highScore: number, scoreMultiplier: number, onOpenSettings: () => void, t: any, gameMode: string | null, movesLeft: number, maxBlock: number, gameOver: boolean, challengeLevel?: number, currentTarget?: number }) => (
<div className="flex justify-between items-start w-full mb-6 relative shrink-0">
    <div className="flex flex-col flex-1 min-w-0 pr-1">
      <h1 className="text-base sm:text-2xl font-light tracking-[0.2em] sm:tracking-[0.3em] opacity-90 pl-1 mt-1 leading-tight whitespace-nowrap">GRID<br/>EVOLUTION</h1>
      {gameMode === 'moveLimit' && challengeLevel && (
         <div className="flex items-center gap-1.5 ml-1 mt-1 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest text-pink-400 uppercase">{t.stageWord} {challengeLevel}</span>
         </div>
      )}
    </div>
    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
      {gameMode === 'moveLimit' ? (
         <div className="flex gap-1.5 sm:gap-2">
            <motion.div 
               animate={(maxBlock >= (currentTarget || 256) / 2 && !gameOver) ? { boxShadow: ["0 0 10px rgba(45,212,191,0.2)", "0 0 20px rgba(45,212,191,0.6)", "0 0 10px rgba(45,212,191,0.2)"] } : {}}
               transition={{ duration: 1.5, repeat: Infinity }}
               className={`bg-white/[0.06] rounded-xl py-1.5 px-1.5 sm:py-2 sm:px-3 flex flex-col items-center border ${maxBlock >= (currentTarget || 256) / 2 ? 'border-teal-400/50 text-teal-300' : 'border-white/[0.08]'} min-w-[56px] sm:min-w-[70px]`}
               style={{ boxShadow: '0 4px 20px -2px rgba(0,0,0,0.3)' }}
            >
               <span className={`text-[8px] sm:text-[9px] uppercase tracking-[0.15em] mb-0.5 ${maxBlock >= (currentTarget || 256) / 2 ? 'opacity-80' : 'opacity-40'}`}>🎯 {t.targetGoal}</span>
               <span className="text-sm sm:text-lg font-extralight leading-none">{currentTarget || 256}</span>
            </motion.div>
            <motion.div 
               animate={(movesLeft <= 20 && !gameOver) ? { scale: [1, 1.05, 1], boxShadow: ["0 0 10px rgba(236,72,153,0.2)", "0 0 20px rgba(236,72,153,0.6)", "0 0 10px rgba(236,72,153,0.2)"] } : {}}
               transition={{ duration: 1, repeat: Infinity }}
               className={`bg-white/[0.06] rounded-xl py-1.5 px-1.5 sm:py-2 sm:px-3 flex flex-col items-center border ${movesLeft <= 20 ? 'border-pink-500/50 text-pink-400' : 'border-white/[0.08]'} min-w-[56px] sm:min-w-[70px]`}
               style={{ boxShadow: '0 4px 20px -2px rgba(0,0,0,0.3)' }}
            >
               <span className={`text-[8px] sm:text-[9px] uppercase tracking-[0.15em] mb-0.5 ${movesLeft <= 20 ? 'opacity-80' : 'opacity-40'}`}>⏳ {t.movesRemaining || t.movesLeft}</span>
               <span className="text-sm sm:text-lg font-extralight leading-none">{movesLeft}</span>
            </motion.div>
         </div>
      ) : (
         <div className="flex gap-1.5 sm:gap-2">
            <div 
              className="bg-white/[0.06] rounded-xl py-1.5 px-1.5 sm:py-2 sm:px-3 flex flex-col items-center border border-white/[0.08] min-w-[56px] sm:min-w-[70px]"
              style={{ boxShadow: '0 4px 20px -2px rgba(0,0,0,0.3)' }}
            >
              <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.15em] opacity-40 mb-0.5">{t.score}</span>
              <div className="flex items-center gap-1">
                  <span className="text-sm sm:text-lg font-extralight leading-none">{score}</span>
                  {scoreMultiplier > 1 && (
                      <span 
                          className="text-[0.6rem] leading-none bg-purple-500/10 text-purple-200 border border-purple-500/20 px-1 py-0.5 rounded-[4px] font-medium tracking-wider relative -top-[1px]"
                          style={{ textShadow: '0 0 8px rgba(168, 85, 247, 0.4), 0 0 12px rgba(6, 182, 212, 0.3)' }}
                      >
                          {scoreMultiplier}x
                      </span>
                  )}
              </div>
            </div>
            <div 
              className="bg-white/[0.06] rounded-xl py-1.5 px-1.5 sm:py-2 sm:px-3 flex flex-col items-center border border-white/[0.08] min-w-[56px] sm:min-w-[70px]"
              style={{ boxShadow: '0 4px 20px -2px rgba(0,0,0,0.3)' }}
            >
              <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.15em] opacity-40 mb-0.5">{t.best}</span>
              <span className="text-sm sm:text-lg font-extralight leading-none">{highScore}</span>
            </div>
         </div>
      )}
      <motion.button
        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={onOpenSettings}
        className="p-1.5 sm:p-2 text-white/50 hover:text-white bg-white/[0.06] border border-white/[0.08] rounded-xl flex shrink-0"
        style={{ transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
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
  <div className="flex justify-between items-center w-full px-2 mt-1 sm:mt-2">
    <div className="flex gap-4 items-center">
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={onUndo} disabled={undoCount === 0 || !canUndo}
        className="text-white/40 hover:text-white disabled:opacity-20 w-11 h-11 bg-white/[0.06] border border-white/[0.08] rounded-xl flex items-center justify-center relative"
        style={{ transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <Undo2 size={20} strokeWidth={1.5} />
        {undoCount > 0 && (
          <span 
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-black font-light text-[8px] border border-white/20 flex items-center justify-center shadow-lg"
          >
            {undoCount}
          </span>
        )}
      </motion.button>
      <motion.button whileHover={hammerCharge === 100 ? { scale: 1.1 } : {}} whileTap={hammerCharge === 100 ? { scale: 0.9 } : {}}
        onClick={onClear} disabled={hammerCharge < 100}
        className={`relative flex flex-col items-center justify-center w-11 h-11 bg-white/[0.06] border border-white/[0.08] rounded-xl overflow-hidden ${
            isHammerActive 
                ? 'text-[#06B6D4] border-[#06B6D4]/40 [text-shadow:0_0_8px_rgba(6,182,212,0.8)] shadow-[0_0_15px_rgba(6,182,212,0.2)]' 
                : (hammerCharge === 100 ? 'text-white/80 hover:text-white cursor-pointer' : 'text-white/40 cursor-default')
        }`}
        style={{ transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <Hammer size={20} strokeWidth={1.5} className={`${hammerCharge === 100 && !isHammerActive ? 'animate-pulse text-[#06B6D4]' : ''}`} />
        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 overflow-hidden">
            <div className={`h-full transition-all duration-300 ${hammerCharge === 100 ? 'bg-[#06B6D4] shadow-[0_0_5px_#06B6D4]' : 'bg-[#06B6D4]/50'}`} style={{ width: `${hammerCharge}%` }} />
        </div>
      </motion.button>
      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
        onClick={onShuffle} disabled={shuffleCount === 0}
        className="text-white/40 hover:text-white disabled:opacity-20 w-11 h-11 bg-white/[0.06] border border-white/[0.08] rounded-xl flex items-center justify-center relative"
        style={{ transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
      >
        <Shuffle size={20} strokeWidth={1.5} />
        {shuffleCount > 0 && (
          <span 
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-black font-light text-[8px] border border-white/20 flex items-center justify-center shadow-lg"
          >
            {shuffleCount}
          </span>
        )}
      </motion.button>
    </div>

    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
      onClick={onReset}
      className="text-white/40 hover:text-white w-11 h-11 bg-white/[0.06] border border-white/[0.08] rounded-xl flex items-center justify-center relative"
      style={{ transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
    >
      <RotateCcw size={20} strokeWidth={1.5} />
    </motion.button>
  </div>
));

const GridBackground = memo(({ gridSize, tileSizePercent, lowPerformanceMode }: { gridSize: number, tileSizePercent: string, lowPerformanceMode?: boolean }) => (
  <div className="absolute inset-3 z-0 pointer-events-none">
    {Array.from({ length: gridSize }).map((_, r) => (
      Array.from({ length: gridSize }).map((_, c) => (
        <div
          key={`bg-${r}-${c}`}
          className={`absolute bg-[#161616] rounded-xl sm:rounded-[1.5rem] ${lowPerformanceMode ? '' : 'shadow-[inset_0_4px_10px_rgba(0,0,0,0.85)]'} border border-white/[0.02]`}
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

const VFXLayer = memo(React.forwardRef<VFXRef, { tileSizePercent: string, lowPerformanceMode?: boolean }>(({ tileSizePercent, lowPerformanceMode }, ref) => {
  const [effects, setEffects] = useState<VFXParams[]>([]);

  React.useImperativeHandle(ref, () => ({
    addEffects: (newEffects: VFXParams[]) => {
      if (lowPerformanceMode) return; // Ultra-light: suppress all VFX particles
      setEffects(prev => {
         const combined = [...prev, ...newEffects];
         return combined.length > 5 ? combined.slice(-5) : combined;
      });
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
               initial={{ scale: 0.8, opacity: 0.8 }}
               animate={{ scale: 3.5, opacity: 0 }}
               transition={{ duration: 0.8, ease: 'easeOut' }}
               onAnimationComplete={onComplete}
               className="absolute inset-0 rounded-xl sm:rounded-[1.5rem] border-2 border-[#6366F1] shadow-[0_0_10px_#6366F1]"
               style={{ zIndex: 100 }}
            />
        ) : isMergeSpark ? (
            <div className="absolute inset-0 flex items-center justify-center">
                {Array.from({ length: 4 }).map((_, i) => {
                    const angle = (i / 4) * Math.PI * 2 + (Math.random() * 0.2);
                    const dist = 25 + Math.random() * 15;
                    return (
                        <motion.div
                            key={`sp-${i}`}
                            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: angle * (180/Math.PI) }}
                            animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: [0, 1.5, 0], opacity: [1, 1, 0] }}
                            transition={{ duration: 0.1, ease: 'easeOut' }}
                            onAnimationComplete={i === 0 ? onComplete : undefined}
                            className="absolute bg-white will-change-transform transform-gpu"
                            style={{
                                width: `${6 + Math.random() * 6}px`,
                                height: '1px',
                                boxShadow: '0 0 4px #6366F1',
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

// --- INJECT NEW TRANSLATIONS ---
const newTranslations: Record<string, any> = {
  en: { selectMode: "Select Mode", classicMode: "Classic Evolution", movesLeft: "Moves Left", outOfMoves: "Out of Moves!", backToMenu: "Main Menu", targetGoal: "Target", challengeWin: "CHALLENGE COMPLETE!", movesRemaining: "Moves Remaining", nextStage: "NEXT STAGE", rateTitle: "ENJOYING THE GRID?", rateDesc: "Help us evolve! Rate us on the Play Store to support new updates.", rateBtn: "RATE NOW", rateLater: "MAYBE LATER" },
  tr: { selectMode: "OYUN MODU", classicMode: "Klasik Evrim", movesLeft: "Kalan Hamle", outOfMoves: "Hamleler Tükendi!", backToMenu: "Ana Menü", targetGoal: "Hedef", challengeWin: "GÖREV BAŞARILI!", movesRemaining: "Hamle Kaldı", nextStage: "SONRAKİ BÖLÜM", rateTitle: "IZGARAYI BEĞENDİN Mİ?", rateDesc: "Evrimleşmemize yardımcı ol! Yeni güncellemeleri desteklemek için bizi Play Store'da puanla.", rateBtn: "PUAN VER", rateLater: "BELKİ DAHA SONRA" },
  de: { selectMode: "Modus Wählen", classicMode: "Klassische Evolution", movesLeft: "Züge Übrig", outOfMoves: "Keine Züge Mehr!", backToMenu: "Hauptmenü", targetGoal: "Ziel", challengeWin: "HERAUSFORDERUNG ABGESCHLOSSEN!", movesRemaining: "Verbleibende Züge", nextStage: "NÄCHSTE STUFE", rateTitle: "GEFÄLLT DIR DAS FELD?", rateDesc: "Hilf uns zu wachsen! Bewerte uns im Play Store.", rateBtn: "BEWERTEN", rateLater: "SPÄTER" },
  pl: { selectMode: "Wybierz Tryb", classicMode: "Klasyczna Ewolucja", movesLeft: "Ruchy", outOfMoves: "Koniec Ruchów!", backToMenu: "Menu Główne", targetGoal: "Cel", challengeWin: "WYZWANIE UKOŃCZONE!", movesRemaining: "Pozostałe Ruchy", nextStage: "NASTĘPNY ETAP", rateTitle: "ENJOYING THE GRID?", rateDesc: "Help us evolve! Rate us on the Play Store to support new updates.", rateBtn: "RATE NOW", rateLater: "MAYBE LATER" },
  es: { selectMode: "Seleccionar Modo", classicMode: "Evolución Clásica", movesLeft: "Movimientos", outOfMoves: "¡Sin Movimientos!", backToMenu: "Menú Principal", targetGoal: "Objetivo", challengeWin: "¡DESAFÍO COMPLETADO!", movesRemaining: "Movimientos Restantes", nextStage: "SIGUIENTE NIVEL", rateTitle: "¿TE GUSTA EL TABLERO?", rateDesc: "¡Ayúdanos a evolucionar! Califícanos en la Play Store.", rateBtn: "CALIFICAR", rateLater: "MÁS TARDE" },
  fr: { selectMode: "Choisir Mode", classicMode: "Évolution Classique", movesLeft: "Coups Restants", outOfMoves: "Plus de Coups!", backToMenu: "Menu Principal", targetGoal: "Objectif", challengeWin: "DÉFI REUSSI!", movesRemaining: "Mouvements Restants", nextStage: "PROCHAIN NIVEAU", rateTitle: "AIMEZ-VOUS LA GRILLE?", rateDesc: "Aidez-nous à évoluer! Notez-nous sur le Play Store.", rateBtn: "NOTER", rateLater: "PLUS TARD" },
  ru: { selectMode: "Выбор Режима", classicMode: "Классика", movesLeft: "Осталось Ходов", outOfMoves: "Ходы Закончились!", backToMenu: "Главное Меню", targetGoal: "Цель", challengeWin: "ИСПЫТАНИЕ ЗАВЕРШЕНО!", movesRemaining: "Осталось Ходов", nextStage: "СЛЕДУЮЩИЙ ЭТАП", rateTitle: "НРАВИТСЯ СЕТКА?", rateDesc: "Помогите нам развиваться! Оцените нас в Play Store.", rateBtn: "ОЦЕНИТЬ", rateLater: "ПОЗЖЕ" },
  it: { selectMode: "Seleziona Modo", classicMode: "Evoluzione Classica", movesLeft: "Mosse Rimaste", outOfMoves: "Mosse Esaurite!", backToMenu: "Menu Principale", targetGoal: "Obiettivo", challengeWin: "SFIDA COMPLETATA!", movesRemaining: "Mosse Rimaste", nextStage: "PROSSIMO LIVELLO", rateTitle: "TI PIACE LA GRIGLIA?", rateDesc: "Aiutaci a evolverci! Valutaci su Play Store.", rateBtn: "VALUTA", rateLater: "PIÙ TARDI" },
  ko: { selectMode: "모드 선택", classicMode: "클래식 에볼루션", movesLeft: "남은 이동", outOfMoves: "이동 횟수 마감!", backToMenu: "메인 메뉴", targetGoal: "목표", challengeWin: "챌린지 완료!", movesRemaining: "남은 이동 횟수", nextStage: "다음 스테이지", rateTitle: "그리드가 마음에 드시나요?", rateDesc: "우리가 진화할 수 있도록 도와주세요! 플레이 스토어에서 별점을 남겨주세요.", rateBtn: "지금 평가하기", rateLater: "나중에 하기" },
  ja: { selectMode: "モード選択", classicMode: "クラシック進化", movesLeft: "残り移動", outOfMoves: "移動回数終了！", backToMenu: "メインメニュー", targetGoal: "目標", challengeWin: "チャレンジクリア！", movesRemaining: "残り移動数", nextStage: "次のステージ", rateTitle: "グリッドは楽しいですか？", rateDesc: "進化にご協力ください！Playストアで評価をお願いします。", rateBtn: "評価する", rateLater: "後で" },
  zh: { selectMode: "选择模式", classicMode: "经典进化", movesLeft: "剩余步数", outOfMoves: "步数已用尽！", backToMenu: "主菜单", targetGoal: "目标", challengeWin: "挑战完成！", movesRemaining: "剩余步数", nextStage: "下一关", rateTitle: "喜欢这个网格吗？", rateDesc: "赞助我们的进化！请在应用商店为我们评分。", rateBtn: "现在评分", rateLater: "稍后再说" },
  ar: { selectMode: "اختر الوضع", classicMode: "التطور الكلاسيكي", movesLeft: "الحركات المتبقية", outOfMoves: "انتهت الحركات!", backToMenu: "القائمة الرئيسية", targetGoal: "الهدف", challengeWin: "تم اكتمال التحدي!", movesRemaining: "الحركات المتبقية", nextStage: "المرحلة التالية", rateTitle: "هل أعجبتك الشبكة؟", rateDesc: "ساعدنا على التطور! قيمنا على متجر Play لدعم التحديثات الجديدة.", rateBtn: "قيم الآن", rateLater: "ربما لاحقاً" }
};
Object.keys(TRANSLATIONS).forEach(lang => {
  if (newTranslations[lang]) {
    Object.assign(TRANSLATIONS[lang], newTranslations[lang]);
  } else {
    Object.assign(TRANSLATIONS[lang], newTranslations['en']);
  }
});

// --- Main App Component ---
type GameMode = 'classic' | 'moveLimit';

export default function App() {
  const [showRateModal, setShowRateModal] = useState<boolean>(false);
  const getWebViewVersion = (): number => {
    if (typeof navigator !== 'undefined') {
      const match = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
      return match ? parseInt(match[2], 10) : 100; // Bulamazsa modern varsay
    }
    return 100;
  };

  const [isOutdatedWebView, setIsOutdatedWebView] = useState<boolean>(false);

  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const gameModeRef = useRef<GameMode | null>(null);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState<number>(() => Number(localStorage.getItem('grid-evo-challenge-max-unlocked')) || 1);
  const maxUnlockedLevelRef = useRef<number>(1);
  useEffect(() => { maxUnlockedLevelRef.current = maxUnlockedLevel; }, [maxUnlockedLevel]);
  
  const [isViewingChallengeTree, setIsViewingChallengeTree] = useState<boolean>(false);
  
  const [challengeLevel, setChallengeLevel] = useState<number>(1);
  const challengeLevelRef = useRef<number>(1);
  useEffect(() => { challengeLevelRef.current = challengeLevel; }, [challengeLevel]);
  const [movesLeft, setMovesLeft] = useState<number>(80);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);
  const [currentLang, setCurrentLang] = useState(() => {
    const savedLang = localStorage.getItem('grid-evo-lang');
    if (savedLang && TRANSLATIONS[savedLang]) return savedLang;
    const detectedLang = typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en';
    return TRANSLATIONS[detectedLang] ? detectedLang : 'en';
  });

  useEffect(() => {
    localStorage.setItem('grid-evo-lang', currentLang);
  }, [currentLang]);

  // Force native system bars to opaque black on Capacitor/Android
  // Prevents nav buttons from camouflaging into game background on old tablets/Custom ROMs
  useEffect(() => {
    try {
      const cap = (window as any)?.Capacitor;
      if (cap?.Plugins?.StatusBar) {
        cap.Plugins.StatusBar.setBackgroundColor({ color: '#000000' });
        cap.Plugins.StatusBar.setStyle({ style: 'DARK' });
        cap.Plugins.StatusBar.setOverlaysWebView({ overlay: false });
      }
    } catch (_e) {
      console.log("StatusBar native bridge not ready");
    }
  }, []);

  const t = useMemo(() => {
    const targetLanguageObject = TRANSLATIONS[currentLang] || TRANSLATIONS['en'];
    return new Proxy(targetLanguageObject, {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop as keyof typeof targetLanguageObject];
        }
        return TRANSLATIONS['en'][prop as keyof typeof TRANSLATIONS['en']] || prop;
      }
    });
  }, [currentLang]);

  const getTracking = useCallback((standard = 'tracking-[0.2em]', cjk = 'tracking-wide') => {
    return ['ko', 'ja', 'zh'].includes(currentLang) ? cjk : standard;
  }, [currentLang]);

  const [tiles, setTiles] = useState<TileConfig[]>([]);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [highestLevel, setHighestLevel] = useState<number>(1);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameOverStats, setGameOverStats] = useState<{ isNewRecord: boolean, maxBlock: number, finalMoves: number, finalLevel: number, longestCombo: number, isVictory?: boolean } | null>(null);
  const [moves, setMoves] = useState<number>(0);
  const movesRef = useRef(0);
  useEffect(() => { movesRef.current = moves; }, [moves]);
  const [maxBlock, setMaxBlock] = useState<number>(2);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);

  // previewDir useEffect removed to fix TS compilation errors

  const [flashBar, setFlashBar] = useState(false);
  const [isAppVisible, setIsAppVisible] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(() => !localStorage.getItem('grid-evo-onboarding-complete'));
  const [infoStep, setInfoStep] = useState(1);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('grid-evo-sound') !== 'false');
  const [hapticsEnabled, setHapticsEnabled] = useState(() => localStorage.getItem('grid-evo-haptic') !== 'false');
  const [lowPerformanceMode, setLowPerformanceMode] = useState(() => {
    const savedMode = localStorage.getItem('grid-evo-low-perf');
    if (savedMode !== null) return savedMode === 'true';
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return navigator.hardwareConcurrency <= 4;
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('grid-evo-low-perf', String(lowPerformanceMode));
  }, [lowPerformanceMode]);

  // Post-native loading screen: shows cyber-pastel loader until core game state is ready
  const [appReady, setAppReady] = useState(false);
  useEffect(() => {
    const version = getWebViewVersion();
    if (version < 95) {
      setIsOutdatedWebView(true);
    }
    // Allow one frame for React to mount + localStorage reads to settle
    const raf = requestAnimationFrame(() => {
      setAppReady(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [savedGameData, setSavedGameData] = useState<any>(null);

  const isViewingChallengeTreeRef = useRef<boolean>(false);
  const showExitConfirmRef = useRef<boolean>(false);

  useEffect(() => { isViewingChallengeTreeRef.current = isViewingChallengeTree; }, [isViewingChallengeTree]);
  useEffect(() => { showExitConfirmRef.current = showExitConfirm; }, [showExitConfirm]);

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
  const lastVoidPos = useRef<{ r: number, c: number } | null>(null);

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
      game: gameOver,
      isMainMenu: gameMode === null,
      isChallengeTree: isViewingChallengeTree
  });

  useEffect(() => {
      modalsRef.current = {
          settings: isSettingsOpen,
          info: showInfoModal,
          recovery: showRecoveryModal,
          exit: showExitConfirm,
          reset: showResetConfirm,
          game: gameOver,
          isMainMenu: gameMode === null,
          isChallengeTree: isViewingChallengeTree
      };
  }, [isSettingsOpen, showInfoModal, showRecoveryModal, showExitConfirm, showResetConfirm, gameOver, gameMode, isViewingChallengeTree]);

  useEffect(() => {
    let backButtonListener: any = null;

    const setupBackButton = async () => {
      try {
        const { App } = await import('@capacitor/app');
        
        // Varsa eski dinleyiciyi temizle
        if (backButtonListener) {
          backButtonListener.remove();
        }

        backButtonListener = await App.addListener('backButton', () => {
          try {
            // 1. KORUMA: Çıkış onay modalı açıksa kapat ve çık
            if (showExitConfirmRef.current) {
              setShowExitConfirm(false);
              return;
            }

            // 2. KORUMA: Ana menüdeysek çıkış onay modalını aç
            if (gameModeRef.current === null) {
              setShowExitConfirm(true);
              return;
            }

            // 3. KORUMA: Challenge Bölüm Ağacı (Level Tree) ekranındaysak ana menüye dön
            if (gameModeRef.current === 'moveLimit' && isViewingChallengeTreeRef.current) {
              setGameMode(null);
              setIsViewingChallengeTree(false);
              return;
            }

            // 4. KORUMA: Aktif oyun esnasındaysak ana menüye dön
            if (gameModeRef.current !== null) {
              handleBackToMenu();
            }
          } catch (innerError) {
            console.error("Geri tuşu iç mantık hatası:", innerError);
          }
        });
      } catch (err) {
        console.error("Capacitor App plugin yüklenemedi:", err);
      }
    };

    setupBackButton();

    // Lock to portrait if possible
    try {
      if (typeof window !== 'undefined' && window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
        (window.screen.orientation as any).lock('portrait').catch(() => {});
      }
    } catch(e) {}

    // MEMORY LEAK VE ÇAKIŞMA ÖNLEYİCİ CLEANUP
    return () => {
      if (backButtonListener) {
        backButtonListener.remove();
      }
    };
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
  }, []);

  // Save game session whenever key states change
  useEffect(() => {
    if (!gameMode) return;
    const saveKey = gameMode === 'classic' ? 'grid-evo-session-classic' : 'grid-evo-session-challenge';

    if (tiles.length > 0 && !gameOver && moves > 0) {
      const session: any = {
        tiles,
        score,
        moves,
        gridSize,
        maxBlock,
        powerUps,
        history
      };
      if (gameMode === 'moveLimit') {
        session.movesLeft = movesLeft;
        session.challengeLevel = challengeLevelRef.current;
      }
      localStorage.setItem(saveKey, JSON.stringify(session));
    } else if (gameOver || (tiles.length > 0 && moves === 0)) {
      localStorage.removeItem(saveKey);
    }
  }, [tiles, score, moves, gridSize, maxBlock, powerUps, history, gameOver, gameMode, movesLeft]);

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
    localStorage.removeItem('grid-evo-session-classic');
    setShowRecoveryModal(false);
    setSavedGameData(null);
    initializeGame('classic');
  };

  useEffect(() => {
    if (gameMode === 'moveLimit' && movesLeft <= 0 && !gameOver) {
       setGameOver(true);
       setGameOverStats({
           isNewRecord: score > highScore,
           maxBlock: maxBlock,
           finalMoves: moves,
           finalLevel: levelInfo.level,
           longestCombo: 0
       });
    }
  }, [movesLeft, gameMode, gameOver, score, highScore, maxBlock, moves, levelInfo.level]);

  useEffect(() => {
    if (gameMode === 'moveLimit') return;
    const currentLevel = levelInfo.level;
    let targetGridSize = 4;
    
    if (currentLevel >= 4 && maxBlock >= 1024) {
      targetGridSize = 6;
    } else if (currentLevel >= 2 && maxBlock >= 256) {
      targetGridSize = 5;
    }

    if (currentLevel > prevLevelRef.current) {
        let message = t.levelReached.replace('{level}', String(currentLevel));
        
        if (targetGridSize === 6 && gridSize < 6) {
          message = t.levelUpUnlocked6x6;
        } else if (targetGridSize === 5 && gridSize < 5) {
          message = t.levelUpUnlocked5x5;
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
    // BEREKET modu kontrolü: moveLimit modunda lucky ise sadece 4 ve 8 doğar
    if (gameModeRef.current === 'moveLimit') {
      const currentConfig = CHALLENGE_LEVELS[challengeLevelRef.current - 1];
      if (currentConfig?.tileSpawnModifier === 'lucky') {
        return Math.random() < 0.8 ? 4 : 8; // Bereket modunda 2 yasak!
      }
    }
    const rand = Math.random();
    if (lvl >= 4) {
      if (rand < 0.05) return 8;  // %5 şansla 8 doğar
      if (rand < 0.20) return 4;  // %15 şansla 4 doğar (0.05 ile 0.20 arası)
      return 2;
    }
    if (lvl >= 2) {
      if (rand < 0.10) return 4;  // %10 şansla 4 doğar
      return 2;
    }
    return 2;
  }, []);

  const handleBackToMenu = useCallback(() => {
    setGameMode(null);
    setGameOver(false);
    setGameOverStats(null);
    setTiles([]);
    localStorage.removeItem('grid-evo-session');
  }, []);

  const initializeGame = useCallback((explicitMode?: GameMode, targetLvl?: number) => {
    const activeMode = explicitMode || gameMode;
    const currentLvl = targetLvl || challengeLevelRef.current;
    const currentConfig = CHALLENGE_LEVELS[currentLvl - 1] || CHALLENGE_LEVELS[0];
    
    if (activeMode === 'classic') localStorage.removeItem('grid-evo-session-classic');
    if (activeMode === 'moveLimit') localStorage.removeItem('grid-evo-session-challenge');
    setScore(0);
    setScoreMultiplier(1);
    setGameOver(false);
    setGameOverStats(null);
    setMoves(0);
    if (activeMode === 'moveLimit') {
      setMovesLeft(currentConfig.moves);
    }
    setHistory([]);
    setPowerUps({ undo: 3, clear: 1, shuffle: 1 });
    setHammerCharge(100);
    
    const activeGridSize = (activeMode === 'moveLimit' && currentConfig.gridSize) ? currentConfig.gridSize : 4;
    setGridSize(activeGridSize);
    gridSizeRef.current = activeGridSize;
    
    lastVoidPos.current = null;
    vfxRef.current?.clearEffects();
    setTiles([]);

    setTimeout(() => {
      const r1 = Math.floor(Math.random() * activeGridSize), c1 = Math.floor(Math.random() * activeGridSize);
      let r2, c2;
      do {
        r2 = Math.floor(Math.random() * activeGridSize);
        c2 = Math.floor(Math.random() * activeGridSize);
      } while (r1 === r2 && c1 === c2);

      setTiles([
        { id: generateId(), value: 2, row: r1, col: c1, isNew: true },
        { id: generateId(), value: generateSpawnValue(1), row: r2, col: c2, isNew: true }
      ]);
    }, 0);
  }, [generateSpawnValue, gameMode]);

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
      if (lowPerformanceMode) {
          newEffects.push = (() => 0) as any;
      }

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

        const spawnedTiles: TileConfig[] = [];
        if (emptySpots.length > 0) {
          const currentLevel = getLevelInfo(scoreRef.current).level;
          let spawnCount = 1;
          if (gSize === 5) spawnCount = 2; // 5x5 gridde her hamlede 2 taş doğar
          if (gSize === 6) spawnCount = 3; // 6x6 gridde her hamlede 3 taş doğar

          for (let i = 0; i < spawnCount && emptySpots.length > 0; i++) {
              const spotIndex = Math.floor(Math.random() * emptySpots.length);
              const spot = emptySpots[spotIndex];
              
              spawnedTiles.push({ 
                  id: generateId(), 
                  value: generateSpawnValue(currentLevel), 
                  row: spot.r, 
                  col: spot.c, 
                  isNew: true
              });
              
              emptySpots.splice(spotIndex, 1);
          }
          
          const maxVoids = gSize === 4 ? 2 : gSize === 5 ? 4 : 6; // 6x6 gridde aynı anda en fazla 6 void çıkabilsin
          const currentVoids = nextTiles.filter(t => t.isVoid && !t.isDying).length;
          
          let spawnInterval = 5;
          let voidChance = Math.min(0.60 + (currentLevel - 1) * 0.05, 0.95);
          let currentMaxVoids = maxVoids;
          let voidDurationBonus = 0;
          
          if (gameModeRef.current === 'moveLimit') {
              const currentConfig = CHALLENGE_LEVELS[challengeLevelRef.current - 1] || CHALLENGE_LEVELS[0];
              spawnInterval = currentConfig.voidInterval;
              voidChance = currentConfig.voidChance;
              // KABUS modu: Engeller tahtada +2 hamle daha uzun kalır
              if (currentConfig.levelStyle === 'KABUS') {
                  voidDurationBonus = 2;
              }
          }
          
          if (emptySpots.length > 0 && Math.floor(movesRef.current + 1) % spawnInterval === 0 && currentVoids < currentMaxVoids) {
              if (Math.random() < voidChance) {
                  // Filter emptySpots to prevent spawning consecutively in the last void position
                  let validSpots = emptySpots.filter(spot => spot.r !== lastVoidPos.current?.r || spot.c !== lastVoidPos.current?.c);
                  if (validSpots.length === 0) {
                      validSpots = emptySpots; // Fallback: use all empty spots if only the last void cell is available
                  }

                  const innerSpots = validSpots.filter(spot => spot.r > 0 && spot.r < gSize - 1 && spot.c > 0 && spot.c < gSize - 1);
                  const outerSpots = validSpots.filter(spot => spot.r === 0 || spot.r === gSize - 1 || spot.c === 0 || spot.c === gSize - 1);
                  let voidSpot;
                  let spotsToVoid: {r: number, c: number}[] = [];
                  
                  if (gSize >= 5 && Math.random() < 0.3 && innerSpots.length > 0) {
                      const potentialTopLefts = validSpots.filter(s => 
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
                      const baseDuration = gSize >= 5 ? 6 + Math.floor(Math.random() * 3) : (Math.random() < 0.5 ? 4 : 5);
                      const voidDuration = baseDuration + voidDurationBonus;
                      playVoidCreate();
                      spotsToVoid.forEach(spot => {
                          spawnedTiles.push({
                              id: generateId(),
                              value: 0,
                              row: spot.r,
                              col: spot.c,
                              isVoid: true,
                              voidMoves: voidDuration,
                              isNew: true
                          });
                      });
                      // Remember this void position to prevent sequential spawn here
                      lastVoidPos.current = { r: spotsToVoid[0].r, c: spotsToVoid[0].c };
                  }
              }
          }
        }

        // --- DEFER STATE UPDATES (Single Batched Update at 160ms) ---
        const dyingIds = new Set(dyingTiles.map(t => t.id));
        const delayTime = lowPerformanceMode ? 0 : 160;

        // Render Pipeline Fix: Spawn tiles after 30ms to break the CPU spike
        if (spawnedTiles.length > 0) {
            setTimeout(() => {
                requestAnimationFrame(() => {
                    setTiles(current => [...current, ...spawnedTiles]);
                });
            }, 30);
        }

        setTimeout(() => {
            requestAnimationFrame(() => {
                // Clean up dying tiles first
                setTiles(current => current.filter(t => !dyingIds.has(t.id)));

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
                if (gameModeRef.current === 'moveLimit') {
                  setMovesLeft(prev => Math.max(0, prev - 1));
                }
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
                  if (comboMultiplier === 2) comboTextStr = t.double;
                  else if (comboMultiplier === 3) comboTextStr = t.triple;
                  else if (comboMultiplier === 4) comboTextStr = t.quadruple;
                  else if (comboMultiplier === 5) comboTextStr = t.penta;
                  else if (comboMultiplier >= 6) comboTextStr = t.hexa;

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

                const nextValidState = [...nextTiles, ...spawnedTiles].filter(t => !t.isDying);
                const currentMaxBlock = Math.max(...nextValidState.filter(t => !t.isVoid).map(t => t.value), 2);
                setMaxBlock(prev => Math.max(prev, currentMaxBlock));

                const currentTarget = gameModeRef.current === 'moveLimit' ? (CHALLENGE_LEVELS[challengeLevelRef.current - 1]?.target || 1024) : 2048;
                if (gameModeRef.current === 'moveLimit' && currentMaxBlock >= currentTarget) {
                   if (challengeLevelRef.current === maxUnlockedLevelRef.current && challengeLevelRef.current < 105) {
                       const nextMax = challengeLevelRef.current + 1;
                       setMaxUnlockedLevel(nextMax);
                       localStorage.setItem('grid-evo-challenge-max-unlocked', String(nextMax));
                   }
                   setGameOver(true);
                   const nextScore = scoreRef.current + finalScoreUpdate;
                   const isRecord = nextScore > highScore;
                   setGameOverStats({
                       isNewRecord: isRecord,
                       maxBlock: currentMaxBlock,
                       finalMoves: movesRef.current + 1,
                       finalLevel: getLevelInfo(nextScore).level,
                       longestCombo: Math.max(longestCombo, mergesInMove),
                       isVictory: true
                   });
                   const hasRated = localStorage.getItem('grid-evo-already-rated') === 'true';
                   if (!hasRated && challengeLevelRef.current >= 10) {
                       // 10. bölümde olan yeni oyuncularda ve 10. bölümü halihazırda geçmiş eski oyuncuların güncelleme sonrası ilk zaferinde tetiklenir
                       setShowRateModal(true);
                   }
                   if (isRecord) setConfetti(Date.now());
                } else if (checkGameOver(nextValidState, gSize)) {
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
                   if (gameModeRef.current === 'classic') {
                       const hasRated = localStorage.getItem('grid-evo-already-rated') === 'true';
                       if (!hasRated) {
                           setShowRateModal(true);
                       }
                   }
                   if (isRecord) setConfetti(Date.now());
                }
            });
        }, delayTime);
        
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
        if (gameModeRef.current === 'moveLimit') {
            setMovesLeft(prev => Math.max(0, prev - 1));
        }
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
      
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); handleMove(-1, 0); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); handleMove(1, 0); break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); handleMove(0, -1); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); handleMove(0, 1); break;
      }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown, { passive: false });
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
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
        if ('touches' in e) e.preventDefault();
    }
  };

  const onTouchEnd = (e?: React.TouchEvent | React.MouseEvent) => {
    if (touchStart && e) {
        let clientX: number | undefined;
        let clientY: number | undefined;

        if ('changedTouches' in e && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else if ('touches' in e && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if ('clientX' in e) {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        if (clientX !== undefined && clientY !== undefined) {
            const dx = clientX - touchStart.x;
            const dy = clientY - touchStart.y;

            let dir: { r: number, c: number } | null = null;
            if (Math.abs(dx) > Math.abs(dy)) {
              if (Math.abs(dx) > 15) dir = dx > 0 ? { r: 0, c: 1 } : { r: 0, c: -1 };
            } else {
              if (Math.abs(dy) > 15) dir = dy > 0 ? { r: 1, c: 0 } : { r: -1, c: 0 };
            }
            if (dir) {
                handleMove(dir.r, dir.c);
            }
        }
    }
    setTouchStart(null);
    setIsMouseDown(false);
  };

  const getBackgroundColor = (size: number) => {
      if (size >= 6) return '#222222';
      if (size >= 5) return '#1a1a1a';
      return '#121212';
  };

  const tileSizePercent = useMemo(() => `calc((100% - ${(gridSize - 1) * 12}px) / ${gridSize})`, [gridSize]);

  return (
    <div className="app-container relative w-full h-full">
      {gameMode === null && (
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-6 right-6 z-[999] p-2 text-neutral-400 hover:text-white transition-colors pointer-events-auto"
        >
          <SettingsIcon size={24} />
        </button>
      )}

      {/* MODALS */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className={`absolute inset-0 z-[60] ${lowPerformanceMode ? 'bg-black/95' : 'bg-[#121212]/80 backdrop-blur-md'} flex flex-col items-center justify-center p-6`}
          >
            <div className="bg-[#050505] rounded-3xl w-full max-w-[320px] p-6 shadow-2xl border border-white/5 relative">
               <button onClick={() => setIsSettingsOpen(false)} className="absolute top-5 right-5 text-white/40 hover:text-white transition-colors">
                 <X size={20}/>
               </button>
               <h3 className="text-lg font-light tracking-[0.2em] text-center mb-8 mt-2 uppercase">{t.settings}</h3>
               
               <div className="flex justify-between items-center mb-6 px-2">
                  <span className="font-light tracking-wide opacity-80 flex items-center gap-3"><Volume2 size={18}/> {t.sound}</span>
                  <button onClick={() => setSoundEnabled(!soundEnabled)} className={`w-12 h-6 rounded-full relative transition-colors ${soundEnabled ? 'bg-[#D7CCC8]' : 'bg-white/10'}`}>
                     <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${soundEnabled ? 'left-7 bg-[#5D4037]' : 'left-1 bg-white/50'}`} />
                  </button>
               </div>
               
               <div className="flex justify-between items-center mb-8 px-2">
                  <span className="font-light tracking-wide opacity-80 flex items-center gap-3"><Vibrate size={18}/> {t.haptics}</span>
                  <button onClick={() => setHapticsEnabled(!hapticsEnabled)} className={`w-12 h-6 rounded-full relative transition-colors ${hapticsEnabled ? 'bg-[#D7CCC8]' : 'bg-white/10'}`}>
                     <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${hapticsEnabled ? 'left-7 bg-[#5D4037]' : 'left-1 bg-white/50'}`} />
                  </button>
               </div>

                <div className="flex justify-between items-center mb-8 px-2">
                   <span className="font-light tracking-wide opacity-80 flex items-center gap-3">
                      <Grid size={18} />
                      {t.language}
                   </span>
                   <select
                      value={currentLang}
                      onChange={(e) => setCurrentLang(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-light tracking-wide text-white/80 focus:outline-none focus:ring-1 focus:ring-[#06B6D4] cursor-pointer"
                   >
                      <option value="en" className="bg-[#050505] text-white">English</option>
                      <option value="tr" className="bg-[#050505] text-white">Türkçe</option>
                      <option value="de" className="bg-[#050505] text-white">Deutsch</option>
                      <option value="pl" className="bg-[#050505] text-white">Polski</option>
                      <option value="es" className="bg-[#050505] text-white">Español</option>
                      <option value="fr" className="bg-[#050505] text-white">Français</option>
                      <option value="ru" className="bg-[#050505] text-white">Русский</option>
                      <option value="it" className="bg-[#050505] text-white">Italiano</option>
                      <option value="ko" className="bg-[#050505] text-white">한국어</option>
                      <option value="ja" className="bg-[#050505] text-white">日本語</option>
                      <option value="zh" className="bg-[#050505] text-white">简体中文</option>
                      <option value="ar" className="bg-[#050505] text-white">العربية</option>
                   </select>
                </div>

               <div className="flex justify-between items-center mb-8 px-2">
                   <span className="font-light tracking-wide opacity-80 flex items-center gap-3"><Zap size={18}/> {t.reduceEffects}</span>
                   <button onClick={() => setLowPerformanceMode(!lowPerformanceMode)} className={`w-12 h-6 rounded-full relative transition-colors ${lowPerformanceMode ? 'bg-[#D7CCC8]' : 'bg-white/10'}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${lowPerformanceMode ? 'left-7 bg-[#5D4037]' : 'left-1 bg-white/50'}`} />
                   </button>
                </div>

               <div className="border-t border-white/5 pt-6 mt-2 flex flex-col gap-3">
                  <button 
                     onClick={() => {
                        setIsSettingsOpen(false);
                        setShowInfoModal(true);
                        setInfoStep(1);
                     }}
                     className={`w-full py-3.5 rounded-xl bg-white/5 text-white/90 font-light text-xs hover:bg-white/10 transition-colors uppercase ${getTracking("tracking-[0.15em]", "tracking-wide")}`}
                  >
                     {t.howToPlay}
                  </button>
                  {!showResetConfirm ? (
                     <button onClick={() => setShowResetConfirm(true)} className={`w-full py-3.5 rounded-xl bg-red-500/10 text-red-400 font-light text-xs hover:bg-red-500/20 transition-colors uppercase ${getTracking("tracking-[0.15em]", "tracking-wide")}`}>{t.resetProgress}</button>
                  ) : (
                     <div className="flex flex-col gap-3">
                         <span className="text-center text-xs text-red-400 font-light tracking-widest flex items-center justify-center gap-2">
                           <AlertTriangle size={14} /> {t.areYouSure}
                         </span>
                         <div className="flex gap-3">
                             <button onClick={handleHardReset} className={`flex-1 py-3 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-light text-xs transition-colors ${getTracking("tracking-widest", "tracking-normal")}`}>{t.yes}</button>
                             <button onClick={() => setShowResetConfirm(false)} className={`flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-light text-xs transition-colors ${getTracking("tracking-widest", "tracking-normal")}`}>{t.no}</button>
                         </div>
                     </div>
                  )}
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className={`absolute inset-0 z-[70] ${lowPerformanceMode ? 'bg-black/95' : 'bg-[#121212]/80 backdrop-blur-md'} flex flex-col items-center justify-center p-6`}
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
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">{t.step1Title}</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        {t.step1Desc}
                     </p>
                  </motion.div>
                )}

                {infoStep === 2 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
                     <div className="w-16 h-16 rounded-xl border border-[#F87171]/30 shadow-[inset_0_0_20px_rgba(248,113,113,0.3)] mb-6 flex items-center justify-center animate-pulse">
                         <AlertTriangle size={28} className="text-[#F87171]" />
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">{t.step2Title}</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        {t.step2Desc}
                     </p>
                  </motion.div>
                )}

                {infoStep === 3 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
                     <div className="w-16 h-16 bg-[#1A1A1A] rounded-[1.5rem] border border-[#9CA3AF]/40 mb-6 flex items-center justify-center font-extralight text-[#9CA3AF] text-3xl">
                         5
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">{t.step3Title}</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        {t.step3Desc}
                     </p>
                  </motion.div>
                )}

                {infoStep === 4 && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center">
                     <div className="w-16 h-16 rounded-xl border border-[#6366F1]/40 shadow-[0_0_15px_rgba(99,102,241,0.5)] mb-6 flex items-center justify-center bg-[#6366F1]/10">
                         <Hammer size={28} className="text-[#6366F1]" />
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">{t.step4Title}</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        {t.step4Desc}
                     </p>
                  </motion.div>
                )}

                {infoStep === 5 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
                     <div className="mb-6 flex items-center justify-center border border-white/10 rounded-xl p-3 bg-white/5">
                        <Grid size={42} strokeWidth={1} className="text-[#9CA3AF] animate-pulse" />
                     </div>
                     <h3 className="text-lg font-thin tracking-[0.1em] mb-4 text-white uppercase">{t.step5Title}</h3>
                     <p className="text-white/80 font-extralight text-sm leading-relaxed tracking-wide">
                        {t.step5Desc}
                     </p>
                  </motion.div>
                )}

                <div className="flex gap-4 w-full mt-8">
                   {infoStep > 1 && (
                      <button 
                         onClick={() => setInfoStep(s => s - 1)}
                         className={`flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 font-light text-xs transition-colors uppercase ${getTracking("tracking-[0.15em]", "tracking-wide")}`}
                      >
                         {t.back}
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
                      className={`flex-[2] py-3.5 rounded-xl bg-[#6366F1]/20 hover:bg-[#6366F1]/30 text-[#6366F1] font-light text-xs transition-colors uppercase ${getTracking("tracking-[0.15em]", "tracking-wide")}`}
                   >
                      {infoStep < 5 ? t.next : t.start}
                   </button>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`absolute inset-0 z-[100] ${lowPerformanceMode ? 'bg-black/95' : 'bg-[#121212]/90 backdrop-blur-lg'} flex flex-col items-center justify-center p-6`}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#050505] rounded-[2.5rem] w-full max-w-[320px] p-8 shadow-2xl border border-white/5 text-center"
            >
              <div className="w-16 h-16 bg-red-400/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} className="text-red-400" />
              </div>
              <h2 className={`text-xl font-light mb-3 text-white uppercase ${getTracking("tracking-[0.2em]", "tracking-wide")}`}>{t.wait}</h2>
              <p className={`text-xs text-white/40 font-light leading-relaxed mb-8 ${getTracking("tracking-widest", "tracking-normal")}`}>
                {t.areYouSureExit}
              </p>
 
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                      if ((window as any)?.Capacitor?.Plugins?.App) {
                          (window as any).Capacitor.Plugins.App.exitApp();
                      } else {
                         setShowExitConfirm(false);
                      }
                  }}
                  className={`w-full py-4 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-2xl text-xs uppercase font-light transition-colors ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                >
                  {t.exitApp}
                </button>
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className={`w-full py-4 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white rounded-2xl text-xs uppercase font-light transition-colors ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                >
                  {t.keepPlaying}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showRecoveryModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`absolute inset-0 z-[100] ${lowPerformanceMode ? 'bg-black/95' : 'bg-[#121212]/90 backdrop-blur-lg'} flex flex-col items-center justify-center p-6`}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-[#050505] rounded-[2.5rem] w-full max-w-[320px] p-8 shadow-2xl border border-white/5 text-center"
            >
              <div className="w-16 h-16 bg-[#A2D2FF]/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <RotateCcw size={32} className="text-[#A2D2FF]" />
              </div>
              <h2 className="text-xl font-light tracking-[0.2em] mb-3 uppercase">{t.welcomeBack}</h2>
              <p 
                className="text-xs text-white/40 font-light tracking-widest leading-relaxed mb-8"
                dangerouslySetInnerHTML={{ __html: t.recoveryText }}
              />

              <div className="flex flex-col gap-3">
                <button
                  onClick={loadSavedGame}
                  className={`w-full py-4 bg-white text-black rounded-2xl text-xs uppercase font-light transition-transform active:scale-95 shadow-xl ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                >
                  {t.continueGame}
                </button>
                <button
                  onClick={discardSavedGame}
                  className={`w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 rounded-2xl text-xs uppercase font-light transition-colors border border-white/5 ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                >
                  {t.startNew}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {gameOver && gameOverStats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className={`fixed inset-0 z-[200] ${lowPerformanceMode ? 'bg-black/95' : 'bg-[#050505]/80 backdrop-blur-xl'} flex flex-col items-center justify-between py-12 px-6`}
          >
            {/* Header */}
            <motion.div 
               initial={{ y: -30, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.2, duration: 0.8 }}
               className="mt-8 text-center"
            >
               <h1 className={`text-xl md:text-2xl font-black text-[#6366F1] uppercase [text-shadow:0_0_15px_rgba(99,102,241,0.5)] ${getTracking("tracking-[0.3em]", "tracking-wider")}`}>
                 {gameOverStats.isVictory ? t.challengeWin : (gameMode === 'moveLimit' && movesLeft <= 0) ? t.outOfMoves : t.evolutionHalted}
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
                      className={`relative mb-4 bg-[#FFE082]/10 border border-[#FFE082]/30 text-[#FFE082] px-4 py-1 text-[10px] sm:text-xs font-bold rounded-full uppercase shadow-[0_0_20px_rgba(255,224,130,0.3)] whitespace-nowrap ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                    >
                      {t.newRecord}
                    </motion.div>
                  )}
                  <div className="text-[4rem] sm:text-[5rem] font-light leading-none tracking-tight text-white [text-shadow:0_0_25px_rgba(255,224,130,0.2)]">
                     {score}
                  </div>
                  <div className={`text-sm mt-2 uppercase font-light text-white/40 ${getTracking("tracking-[0.3em]", "tracking-wider")}`}>
                     {t.finalScore}
                  </div>
               </motion.div>

               {/* Stats Grid */}
               <motion.div 
                 initial={{ y: 20, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 transition={{ delay: 0.6, duration: 0.6 }}
                 className="grid grid-cols-2 gap-2.5 sm:gap-4 w-full px-2"
               >
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-2.5 sm:p-4 flex flex-col gap-0.5 sm:gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-[#FFE082]/70 uppercase">{t.largestBlock}</span>
                     <span className="text-xl font-light text-white">{gameOverStats.maxBlock}</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-2.5 sm:p-4 flex flex-col gap-0.5 sm:gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-white/40 uppercase">{t.totalMoves}</span>
                     <span className="text-xl font-light text-white">{gameOverStats.finalMoves}</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-2.5 sm:p-4 flex flex-col gap-0.5 sm:gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-white/40 uppercase">{t.efficiency}</span>
                     <span className="text-xl font-light text-white">{gameOverStats.finalMoves > 0 ? (score / gameOverStats.finalMoves).toFixed(1) : 0}</span>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-2.5 sm:p-4 flex flex-col gap-0.5 sm:gap-1 items-center justify-center">
                     <span className="text-[10px] tracking-widest text-white/40 uppercase">{t.longestCombo}</span>
                     <span className="text-xl font-light text-white tracking-wider">{gameOverStats.longestCombo}</span>
                  </div>
                  {gameMode !== 'moveLimit' && (
                      <div className="col-span-2 bg-white/5 border border-white/5 rounded-2xl p-2.5 sm:p-4 flex flex-col gap-0.5 sm:gap-1 items-center justify-center">
                         <span className="text-[10px] tracking-widest text-[#6366F1]/70 uppercase">{t.evolutionLevel}</span>
                         <span className="text-xl font-light text-white">{gameOverStats.finalLevel}</span>
                      </div>
                  )}
               </motion.div>
            </div>

            {/* Actions */}
            <motion.div 
               initial={{ y: 30, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.8, duration: 0.6 }}
               className="w-full max-w-md flex flex-col gap-4 mt-8 mb-4"
            >
               {gameOverStats?.isVictory && challengeLevel < 105 && gameMode === 'moveLimit' ? (
                 <button 
                    onClick={() => {
                      const nextLvl = challengeLevel + 1;
                      setChallengeLevel(nextLvl);
                      challengeLevelRef.current = nextLvl;
                      setGameOver(false);
                      setGameOverStats(null);
                      initializeGame('moveLimit', nextLvl);
                    }} 
                    className={`w-full py-4 bg-teal-500 text-black hover:bg-teal-400 rounded-2xl text-xs sm:text-sm font-medium uppercase transition-all shadow-[0_0_20px_rgba(45,212,191,0.3)] flex items-center justify-center gap-3 active:scale-[0.98] ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                 >
                    {t.nextStage}
                 </button>
               ) : (
                 <button 
                    onClick={() => initializeGame(gameMode || undefined, challengeLevel)} 
                    className={`w-full py-4 bg-white text-black hover:bg-white/90 rounded-2xl text-xs sm:text-sm font-light uppercase transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center justify-center gap-3 active:scale-[0.98] ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                 >
                    <RotateCcw size={18} strokeWidth={1.5} /> {t.retry}
                 </button>
               )}
               <button 
                   onClick={() => {
                     setGameOver(false);
                     setGameOverStats(null);
                     setTiles([]);
                     setMovesLeft(80); // KRİTİK TAMİR: Kalan hamle tuzağını sıfırlayarak sonsuz döngü kalkanını kır!
                     if (gameMode === 'moveLimit') {
                       setIsViewingChallengeTree(true);
                     } else {
                       setGameMode(null);
                     }
                   }}
                  className={`w-full py-4 bg-transparent border border-white/10 text-white/80 hover:text-white hover:bg-white/5 rounded-2xl text-xs sm:text-sm font-light uppercase transition-all flex items-center justify-center gap-3 active:scale-[0.98] ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
               >
                  {gameMode === 'moveLimit' ? (
                     <>🗺️ {t.returnToTree}</>
                   ) : (
                     <><Home size={18} strokeWidth={1.5} /> {t.backToMenu}</>
                   )}
               </button>
               {gameMode !== 'moveLimit' && (
               <button 
                  onClick={() => {
                     const text = t.shareMessage
                        .replace('{level}', String(gameOverStats.finalLevel))
                        .replace('{score}', String(score))
                        .replace('{maxBlock}', String(gameOverStats.maxBlock))
                        .replace('{moves}', String(gameOverStats.finalMoves));
                     if (navigator.share) navigator.share({ title: 'Grid Evolution Stats', text }).catch(err=>console.log(err));
                     else { navigator.clipboard.writeText(text); alert('Stats copied to clipboard!'); }
                  }}
                  className={`w-full py-4 bg-transparent border border-white/10 text-white/80 hover:text-white hover:bg-white/5 rounded-2xl text-xs sm:text-sm font-light uppercase transition-all flex items-center justify-center gap-3 active:scale-[0.98] ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
               >
                  <Share2 size={16} strokeWidth={1.5} /> {t.shareResults}
               </button>
               )}
            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* SCREENS */}
      {isOutdatedWebView ? (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#121212] font-sans text-white text-center p-8 select-none">
          <div className="w-16 h-16 bg-pink-500/10 rounded-2xl flex items-center justify-center mb-6 border border-pink-500/30 animate-pulse">
            <AlertTriangle size={32} className="text-pink-400" />
          </div>
          <h2 className="text-xl font-light tracking-[0.2em] mb-4 uppercase">{t.systemUpdateRequired}</h2>
          <p className="text-xs text-white/60 font-extralight tracking-widest leading-relaxed max-w-xs mb-10">
            {t.webviewWarningText}
          </p>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = "market://details?id=com.google.android.webview";
              }
            }}
            className="py-4 px-8 rounded-2xl bg-white text-black text-xs font-medium tracking-[0.2em] uppercase shadow-lg active:scale-95 transition-transform"
          >
            🚀 {t.updateWebviewBtn}
          </button>
        </div>
      ) : !appReady ? (
<div className="h-screen w-full flex flex-col items-center justify-center bg-[#1E1E1E] font-sans text-white select-none">
        {/* Pulsing diamond outline */}
        <motion.div
          animate={{ opacity: [0.3, 0.8, 0.3], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="mb-10"
        >
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="12" y="12" width="40" height="40" rx="8" stroke="rgba(168,162,158,0.5)" strokeWidth="1.5" transform="rotate(45 32 32)" fill="none" />
            <rect x="20" y="20" width="24" height="24" rx="4" stroke="rgba(168,162,158,0.3)" strokeWidth="1" transform="rotate(45 32 32)" fill="none" />
          </svg>
        </motion.div>
        <motion.p
          animate={{ opacity: [0.4, 0.9, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-[10px] font-light tracking-[0.35em] uppercase text-white/50"
        >
          {t.loadingText}
        </motion.p>
      </div>
      ) : gameMode === null ? (
<div className={`h-screen w-full flex flex-col items-center justify-center font-sans select-none relative overflow-hidden ${lowPerformanceMode ? 'bg-[#1E1E1E]' : 'bg-[#121212]'}`}>
               <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center z-10"
         >
            <h1 className="text-4xl sm:text-5xl font-light mb-2 tracking-widest text-white [text-shadow:0_0_20px_rgba(255,255,255,0.2)] text-center">GRID<br/>EVOLUTION</h1>
            <p className="text-white/60 text-xs sm:text-sm uppercase tracking-[0.3em] mb-16">{t.selectMode}</p>
            
            <div className="flex flex-col gap-6 w-72">
              <motion.button
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 onClick={() => {
                   setGameMode('classic');
                   const save = localStorage.getItem('grid-evo-session-classic');
                   if (save) {
                     setSavedGameData(JSON.parse(save));
                     setShowRecoveryModal(true);
                   } else {
                     initializeGame('classic');
                   }
                 }}
                 className="py-5 px-6 rounded-3xl bg-white/5 border border-white/10 text-white font-medium tracking-widest backdrop-blur-md hover:bg-white/10 hover:border-teal-300/50 transition-colors shadow-[0_0_15px_rgba(45,212,191,0.05)] hover:shadow-[0_0_25px_rgba(45,212,191,0.2)] uppercase text-sm"
              >
                 {t.classicMode}
              </motion.button>
              <motion.button
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 onClick={() => {
                   setGameMode('moveLimit');
                   setIsViewingChallengeTree(true);
                 }}
                 className="py-5 px-6 rounded-3xl bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-pink-500/30 text-white font-medium tracking-widest backdrop-blur-md hover:bg-pink-500/20 hover:border-pink-400/60 transition-colors shadow-[0_0_20px_rgba(236,72,153,0.15)] hover:shadow-[0_0_30px_rgba(236,72,153,0.3)] uppercase text-sm"
              >
                 {t.challengeMode}
              </motion.button>
            </div>
         </motion.div>
      </div>
      ) : gameMode === 'moveLimit' && isViewingChallengeTree ? (
       <div className={`h-screen w-full flex flex-col items-center justify-center bg-[#121212] font-sans select-none relative p-6`}>
          <button onClick={() => { setGameMode(null); setIsViewingChallengeTree(false); }} className="absolute top-6 left-6 text-white/50 hover:text-white flex items-center gap-2 text-xs uppercase tracking-widest">← {t.backWord}</button>
          
          <h2 className="text-2xl font-light tracking-[0.2em] mb-2 text-center uppercase">{t.challengeMode}</h2>
          <p className="text-pink-400 text-[10px] uppercase tracking-[0.3em] mb-12">{t.selectStage}</p>
          
          <div className="grid grid-cols-5 gap-4 max-h-[60vh] overflow-y-auto px-4 py-2 Mask-Scrollbar">
             {CHALLENGE_LEVELS.map(cfg => {
                const lvl = cfg.level;
                const isUnlocked = lvl <= maxUnlockedLevel;
                const isActiveNode = lvl === maxUnlockedLevel;
                const save = localStorage.getItem('grid-evo-session-challenge');
                let hasSaveForThisLevel = false;
                if (save) {
                    try {
                        const parsed = JSON.parse(save);
                        if (parsed.challengeLevel === lvl) hasSaveForThisLevel = true;
                    } catch(e) {}
                }
                
                return (
                   <div key={`node-container-${lvl}`} className="flex flex-col items-center gap-4 relative pt-10">
                       {hasSaveForThisLevel && (
                           <motion.button
                               initial={{ opacity: 0, y: 10 }}
                               animate={{ opacity: 1, y: 0, scale: [1, 1.05, 1] }}
                               transition={{ scale: { repeat: Infinity, duration: 2 } }}
                               onClick={() => {
                                   const data = JSON.parse(save!);
                                   setTiles(data.tiles);
                                   setScore(data.score);
                                   setMoves(data.moves);
                                   setGridSize(data.gridSize || 4);
                                   setMaxBlock(data.maxBlock || 2);
                                   setPowerUps(data.powerUps);
                                   setHistory(data.history || []);
                                   setMovesLeft(data.movesLeft !== undefined ? data.movesLeft : cfg.moves);
                                   setChallengeLevel(lvl);
                                   challengeLevelRef.current = lvl;
                                   setIsViewingChallengeTree(false);
                               }}
                               className="absolute top-0 whitespace-nowrap bg-pink-500/20 text-pink-300 border border-pink-500/50 text-[9px] tracking-widest px-3 py-1.5 rounded-full uppercase z-10 animate-pulse"
                           >
                               [ {t.resumeWord} ]
                           </motion.button>
                       )}
                       <motion.button
                          key={`node-${lvl}`}
                          disabled={!isUnlocked}
                          whileHover={isUnlocked ? { scale: 1.05 } : {}}
                          animate={isActiveNode ? {
                             scale: [1, 1.06, 1],
                             borderColor: ["#a855f7", "#ec4899", "#a855f7"],
                             boxShadow: [
                                "0 0 12px rgba(168,85,247,0.5)",
                                "0 0 25px rgba(236,72,153,0.8)",
                                "0 0 12px rgba(168,85,247,0.5)"
                             ]
                          } : {}}
                          transition={isActiveNode ? {
                             repeat: Infinity,
                             duration: 1.8,
                             ease: "easeInOut"
                          } : {}}
                          onClick={() => {
                             setChallengeLevel(lvl);
                             challengeLevelRef.current = lvl;
                             setIsViewingChallengeTree(false);
                             initializeGame('moveLimit', lvl);
                          }}
                          className={`w-16 h-16 rounded-full flex flex-col items-center justify-center border-2 transition-all relative
                             ${isActiveNode ? 'bg-gradient-to-br from-purple-600/20 to-pink-600/20 text-white font-bold' : 
                               isUnlocked ? 'border-purple-500/40 bg-purple-500/5 text-white/80' : 
                               'border-white/5 bg-white/5 text-white/20 opacity-25 cursor-not-allowed'}`}
                       >
                          <span className="text-lg font-light">{lvl}</span>
                       </motion.button>
                    </div>
                 );
              })}
           </div>
        </div>
      ) : (
<motion.div
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
      animate={{ backgroundColor: getBackgroundColor(gridSize) }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="h-screen w-full flex flex-col items-center font-sans text-white overflow-hidden relative overscroll-none select-none"
      style={{
          paddingTop: '1.5rem',
          paddingBottom: '1.5rem'
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onTouchStart}
      onMouseMove={onTouchMove}
      onMouseUp={onTouchEnd}
      onMouseLeave={onTouchEnd}
    >
      <div className="mobile-landscape-warning absolute inset-0 z-[200] hidden bg-[#121212] items-center justify-center flex-col text-center p-6 h-screen">
          <AlertTriangle size={48} className="text-[#6366F1] mb-6"/>
          <h2 className="text-xl font-light tracking-[0.2em] mb-3 uppercase">{t.rotateDevice}</h2>
          <p className="text-sm text-white/60 font-light tracking-widest leading-relaxed max-w-sm">
             {t.warningText}
          </p>
      </div>

      {/* Exit Confirmation Modal */}
      

      {/* Game Recovery Modal */}
      
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
      

      {/* Game Over Modal */}
      

      {/* Settings Modal */}
      

      <div className="flex flex-col w-full h-full max-w-[500px]">
        <div className="flex flex-col w-full px-4 pt-2 pb-2 shrink-0 z-20">
            <Header score={score} highScore={highScore} scoreMultiplier={scoreMultiplier} onOpenSettings={handleOpenSettings} t={t} gameMode={gameMode} movesLeft={movesLeft} maxBlock={maxBlock} gameOver={gameOver} challengeLevel={challengeLevel} currentTarget={gameMode === 'moveLimit' ? (CHALLENGE_LEVELS[challengeLevel - 1]?.target || 1024) : 2048} />
            <LevelBar progress={levelInfo.xp / levelInfo.requiredXp} flash={flashBar} />

            {/* Combo Message (Relocated between Level Bar and Controls) */}
            <div className="h-10 sm:h-12 mb-1 sm:mb-2 flex items-center justify-center relative">
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
                        className="px-4 py-1 rounded-full font-medium tracking-[0.2em] uppercase border border-white/20 bg-white/5 text-white transition-all"
                        style={{
                            fontSize: comboMessage.count && comboMessage.count > 2 ? `${1 + Math.min(comboMessage.count - 2, 4) * 0.2}rem` : '1rem',
                            boxShadow: (comboMessage.count && comboMessage.count >= 6)
                                ? '0 0 30px rgba(239, 68, 68, 0.6), inset 0 0 10px rgba(239, 68, 68, 0.3)'
                                : `0 0 ${15 + (comboMessage.count - 2) * 8}px rgba(255, 145, 0, 0.6), inset 0 0 8px rgba(255, 145, 0, 0.3)`,
                            textShadow: (comboMessage.count && comboMessage.count >= 6)
                                ? '0 0 12px rgba(239, 68, 68, 0.9)'
                                : `0 0 ${6 + (comboMessage.count - 2) * 3}px rgba(255, 145, 0, 0.9)`
                        }}
                      >
                        {comboMessage.text}!
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

        <div className="flex-1 w-full flex items-center justify-center px-4 relative z-10 shrink min-h-0 pb-14 sm:pb-24">
          <AnimatePresence>
            {comboMessage && comboMessage.count && comboMessage.count >= 2 && (
               <motion.div
                 key="combo-aura"
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 transition={{ duration: 0.4 }}
                 className="absolute top-0 left-0 right-0 bottom-20 sm:bottom-24 pointer-events-none flex items-center justify-center -z-10 overflow-visible"
               >
                 {comboMessage.count >= 6 && (
                     <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.2 }}
                        className="fixed inset-0 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(99,102,241,0.25) 100%)' }}
                     />
                 )}
                 <motion.div
                    animate={
                        comboMessage.count >= 6 ? { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] } : 
                        comboMessage.count >= 4 ? { scale: [1, 1.04, 1], opacity: [0.7, 0.9, 0.7] } : { scale: [1, 1.02, 1], opacity: [0.55, 0.7, 0.55] }
                    }
                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                    className="w-[140%] aspect-square rounded-full absolute"
                    style={{ 
                        background: 'radial-gradient(circle, rgba(251, 191, 36, 0.65) 0%, rgba(245, 158, 11, 0.25) 45%, rgba(0, 0, 0, 0) 70%)',
                        mixBlendMode: 'screen',
                        willChange: 'transform, opacity'
                    }}
                 />
               </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            animate={
                shake ? { x: [-shake.intensity, shake.intensity, -shake.intensity, shake.intensity, -shake.intensity/2, shake.intensity/2, 0] } : 
                (levelUpTrigger > 0 ? { scale: [1, 1.05, 1] } : { scale: 1 })}
            transition={{ duration: shake ? 0.4 : 0.6, ease: "easeInOut" }}
            className={`relative w-full aspect-square bg-[#1E1E1E] rounded-[2.5rem] p-3 touch-none overflow-hidden transition-colors duration-700 ${(!isIdle && isAppVisible && movesWithoutMerge >= entropyLimit - 1) ? (lowPerformanceMode ? 'border border-[#F87171]/30' : 'shadow-[0_0_60px_rgba(248,113,113,0.3)] border border-[#F87171]/30') : (!isIdle && isAppVisible && movesWithoutMerge >= entropyLimit - 2) ? (lowPerformanceMode ? 'border border-[#F87171]/10' : 'shadow-[0_0_40px_rgba(248,113,113,0.15)] border border-[#F87171]/10') : (lowPerformanceMode ? 'border border-white/5' : 'shadow-2xl border border-white/5')}`}
            style={{ maxWidth: 'min(100%, calc(100vh - 300px))' }}
          >
            {(!isIdle && isAppVisible && movesWithoutMerge >= entropyLimit - 2) && !lowPerformanceMode && (
                <div 
                   className={`absolute inset-0 pointer-events-none rounded-[2.5rem] z-40 animate-pulse ${movesWithoutMerge >= entropyLimit - 1 ? 'shadow-[inset_0_0_80px_rgba(248,113,113,0.4)]' : 'shadow-[inset_0_0_40px_rgba(248,113,113,0.2)]'}`} 
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
            <GridBackground gridSize={gridSize} tileSizePercent={tileSizePercent} lowPerformanceMode={lowPerformanceMode} />

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
                    lowPerformanceMode={lowPerformanceMode}
                    gameOver={gameOver}
                  />
                ))}
                {/* ghostTiles mapping removed to fix TS compilation errors */}
              </AnimatePresence>
            </div>
            {/* VFX Layer added with pointer-events-none */}
            <div className="absolute inset-3 z-[60] pointer-events-none">
                 <VFXLayer ref={vfxRef} tileSizePercent={tileSizePercent} lowPerformanceMode={lowPerformanceMode} />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
      )}
      <AnimatePresence>
        {showRateModal && (
          <motion.div
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6"
          >
             <motion.div
                initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                className="bg-[#050505] rounded-[2.5rem] w-full max-w-[320px] p-8 shadow-2xl border border-white/5 text-center relative"
             >
                <div className="w-16 h-16 bg-[#FFE082]/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#FFE082]/20">
                   <span className="text-2xl animate-pulse">⭐️</span>
                </div>
                <h2 className={`text-lg font-light mb-3 text-white uppercase ${getTracking("tracking-[0.2em]", "tracking-wide")}`}>{t.rateTitle}</h2>
                <p className="text-xs text-white/50 font-extralight leading-relaxed mb-8 px-2">
                   {t.rateDesc}
                </p>
                <div className="flex flex-col gap-3">
                   <button
                      onClick={() => {
                         localStorage.setItem('grid-evo-already-rated', 'true');
                         setShowRateModal(false);
                         if (typeof window !== 'undefined') {
                            window.location.href = "market://details?id=com.dinzdp.gridevolution";
                         }
                      }}
                      className={`w-full py-4 bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-white border border-pink-500/30 hover:border-pink-500/60 rounded-2xl text-xs uppercase font-medium transition-all shadow-[0_0_15px_rgba(236,72,153,0.2)] ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                   >
                      🚀 {t.rateBtn}
                   </button>
                   <button
                      onClick={() => {
                         localStorage.setItem('grid-evo-already-rated', 'true');
                         setShowRateModal(false);
                      }}
                      className={`w-full py-4 bg-white/5 text-white/40 hover:text-white/60 rounded-2xl text-xs uppercase font-light transition-colors ${getTracking("tracking-[0.2em]", "tracking-wide")}`}
                   >
                      {t.rateLater}
                   </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

}
