(function () {
  'use strict';

  const ALL_FOODS = [
    { id: '비빔밥', image: '18.png?v=2', audio: 'audio_0_비빔밥___나물과_밥을_쓱쓱_비벼_먹는_우리나라의_음식이야_.mp3' },
    { id: '불고기', image: '19.png?v=2', audio: 'audio_2_불고기____달콤한_양념에_고기를_재워_구워먹는_우리나라_인기_요리야_.mp3' },
    { id: '만두', image: '20.png?v=2', audio: 'audio_8_만두_____반죽_안에_고기와_채소를_가득_넣고_쪄서_만드는_중국_요리야__.mp3' },
    { id: '쌀국수', image: '21.png?v=2', audio: 'audio_4_쌀국수___쌀로_만든_면을_시원한_국물에_호로록_먹는_베트남_음식이야_.mp3' },
    { id: '팟타이', image: '22.png?v=2', audio: 'audio_6_팟타이___면과_새우__채소를_달콤_짭짤한_소스에_볶아_만든_태국_음식이야__.mp3' },
    { id: '초밥', image: '23.png?v=2', audio: 'audio_5_초밥____식초_섞인_밥_위에_생선을_올려_한입에_쏙_먹는_일본_요리야__.mp3' },
    { id: '카레', image: '24.png?v=2', audio: 'audio_7_커리___향신료를_듬뿍_넣고_끓여_밥에_쓱쓱_비벼_먹는_인도의_건강_요리야__.mp3' },
    { id: '스파게티', image: '25.png?v=2', audio: 'audio_10_스파게티___긴_면을_돌돌_말아_소스와_함께_먹는_이탈리아_요리야__.mp3' },
    { id: '빠에야', image: '26.png?v=2', audio: 'audio_14_빠에야_____쌀과_해산물을_넣어_함께_볶아_먹는_스페인_요리야__.mp3' },
    { id: '소시지', image: '30.png?v=2', audio: 'audio_15_소시지_____고기를_갈아_길게_만든_뒤_노릇하게_구워_먹는_독일_요리야__.mp3' },
    { id: '피시앤칩스', image: '27.png?v=2', audio: 'audio_13_피시_앤_칩스___생선_튀김과_감자튀김을_함께_먹는_영국의_요리야__.mp3' },
    { id: '햄버거', image: '28.png?v=2', audio: 'audio_11_햄버거_____빵_사이에_고기와_채소를_넣어_든든하게_먹는_미국의_요리야__.mp3' },
    { id: '타코', image: '29.png?v=2', audio: 'audio_16__타코________얇은_빵에_고기와_채소를_듬뿍_싸서_먹는_멕시코_음식이야__.mp3' }
  ];

  const COMPLETION_RANDOM = [
    'audio_31_맛있는_세계의_음식.mp3',
    'audio_32_와!_맛있겠다!_.mp3',
    'audio_33_완성.mp3'
  ];

  const PLACE_SOUND = 'Glow3.mp3';
  const GLOW_VOICE_OVERLAP_SEC = 0.35;

  const foodTray = document.getElementById('foodTray');
  const dragGhost = document.getElementById('dragGhost');
  const dropZones = document.querySelectorAll('.drop-zone');
  const diningTable = document.querySelector('.dining-table');
  const restartBtn = document.getElementById('restartBtn');

  let currentAudio = null;
  let dragState = null;
  let tableSlots = [null, null, null, null];
  let usedFoodIds = new Set();
  let completionPlayed = false;
  const DRAG_THRESHOLD = 20;
  const TOP_ROW_INDICES = new Set([0, 1, 2, 3, 4, 5, 7]);

  function clearDropZoneDragState() {
    dropZones.forEach(function (z) {
      z.classList.remove('highlight');
      z.classList.remove('hint-hidden');
    });
  }

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const audioBufferCache = new Map();

  function resumeAudioContext() {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }

  function loadAudioBuffer(filename) {
    if (audioBufferCache.has(filename)) {
      return audioBufferCache.get(filename);
    }

    const promise = fetch(encodeURI('sound/' + filename))
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to load ' + filename);
        }
        return response.arrayBuffer();
      })
      .then(function (arrayBuffer) { return audioContext.decodeAudioData(arrayBuffer); });

    audioBufferCache.set(filename, promise);
    return promise;
  }

  function getEffectiveDuration(buffer, threshold) {
    var data = buffer.getChannelData(0);
    var lastNonSilent = 0;

    for (var i = data.length - 1; i >= 0; i--) {
      if (Math.abs(data[i]) > threshold) {
        lastNonSilent = i;
        break;
      }
    }

    return (lastNonSilent + 1) / buffer.sampleRate;
  }

  function preloadCompletionSounds() {
    loadAudioBuffer('Glow3.mp3');
    COMPLETION_RANDOM.forEach(function (filename) {
      var audio = new Audio('sound/' + filename);
      audio.preload = 'auto';
    });
  }

  function pickRandomCompletionAudio() {
    return COMPLETION_RANDOM[Math.floor(Math.random() * COMPLETION_RANDOM.length)];
  }

  function playSound(filename) {
    resumeAudioContext();
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    const audio = new Audio('sound/' + filename);
    currentAudio = audio;
    audio.play().catch(function () {});
    return audio;
  }

  function playPlacementSound() {
    resumeAudioContext();
    loadAudioBuffer(PLACE_SOUND)
      .then(function (buffer) {
        var source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(audioContext.currentTime);
      })
      .catch(function () {
        playSound(PLACE_SOUND);
      });
  }

  function getVoiceStartOffset(glowBuffer, overlapSec) {
    var effectiveEnd = getEffectiveDuration(glowBuffer, 0.015);
    var fromRatio = effectiveEnd * 0.68;
    var fromOverlap = Math.max(0, effectiveEnd - overlapSec);

    return Math.min(fromRatio, fromOverlap);
  }

  function playCompletionVoice(voiceFile) {
    playSound(voiceFile);
  }

  function playGlowThenVoice(voiceFile) {
    resumeAudioContext();
    loadAudioBuffer(PLACE_SOUND)
      .then(function (glowBuffer) {
        var startTime = audioContext.currentTime + 0.02;
        var voiceDelayMs = getVoiceStartOffset(glowBuffer, GLOW_VOICE_OVERLAP_SEC) * 1000;

        var glowSource = audioContext.createBufferSource();
        glowSource.buffer = glowBuffer;
        glowSource.connect(audioContext.destination);
        glowSource.start(startTime);

        setTimeout(function () {
          playCompletionVoice(voiceFile);
        }, voiceDelayMs);
      })
      .catch(function () {
        playGlowThenVoiceFallback(voiceFile);
      });
  }

  function playGlowThenVoiceFallback(voiceFile) {
    var glowAudio = new Audio('sound/' + PLACE_SOUND);
    var voiceStarted = false;

    function startVoice() {
      if (voiceStarted) {
        return;
      }
      voiceStarted = true;
      playCompletionVoice(voiceFile);
    }

    glowAudio.addEventListener('timeupdate', function () {
      if (!isFinite(glowAudio.duration)) {
        return;
      }

      var startAt = Math.max(
        0,
        Math.min(glowAudio.duration * 0.68, glowAudio.duration - GLOW_VOICE_OVERLAP_SEC)
      );
      if (glowAudio.currentTime >= startAt) {
        startVoice();
      }
    });
    glowAudio.addEventListener('ended', function () {
      if (!voiceStarted) {
        startVoice();
      }
    });
    glowAudio.play().catch(function () {
      startVoice();
    });
  }

  function getFilledCount() {
    return tableSlots.filter(function (s) { return s !== null; }).length;
  }

  function isFoodUsed(foodId) {
    return usedFoodIds.has(foodId);
  }

  function isSmallFood(foodId) {
    return foodId === '햄버거' || foodId === '만두';
  }

  function getPlacedFoodClass(foodId) {
    if (foodId === '카레') {
      return 'placed-food is-curry';
    }
    if (isSmallFood(foodId)) {
      return 'placed-food is-small-food';
    }
    return 'placed-food';
  }

  function updateDragGhostClass(foodId) {
    dragGhost.classList.toggle('is-curry', foodId === '카레');
    dragGhost.classList.toggle('is-small-food', isSmallFood(foodId));
  }

  function clearDragGhostClass() {
    dragGhost.classList.remove('visible', 'is-curry', 'is-small-food');
  }

  function createFoodItem(food) {
    const el = document.createElement('div');
    el.className = 'food-item';
    el.dataset.foodId = food.id;
    el.dataset.image = food.image;
    el.dataset.audio = food.audio;

    const img = document.createElement('img');
    img.src = 'image/' + food.image;
    img.alt = food.id;
    img.draggable = false;
    el.appendChild(img);

    el.addEventListener('pointerdown', onDragStart);
    return el;
  }

  function renderFoodTray() {
    foodTray.innerHTML = '';

    const row1 = document.createElement('div');
    row1.className = 'food-tray-row';
    const row2 = document.createElement('div');
    row2.className = 'food-tray-row';

    ALL_FOODS.forEach(function (food, index) {
      if (isFoodUsed(food.id)) {
        return;
      }

      const el = createFoodItem(food);
      if (TOP_ROW_INDICES.has(index)) {
        row1.appendChild(el);
      } else {
        row2.appendChild(el);
      }
    });

    if (row1.childElementCount) {
      foodTray.appendChild(row1);
    }
    if (row2.childElementCount) {
      foodTray.appendChild(row2);
    }
  }

  function onDragStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    resumeAudioContext();

    const item = e.currentTarget;
    if (isFoodUsed(item.dataset.foodId)) {
      return;
    }
    const foodId = item.dataset.foodId;
    const image = item.dataset.image;
    const audio = item.dataset.audio;

    dragState = {
      foodId: foodId,
      image: image,
      audio: audio,
      sourceEl: item,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId
    };

    item.classList.add('pressing');
    item.setPointerCapture(e.pointerId);

    dragGhost.innerHTML = '<img src="image/' + image + '" alt="' + foodId + '">';
    updateDragGhostClass(foodId);
    moveGhost(e.clientX, e.clientY);

    item.addEventListener('pointermove', onDragMove);
    item.addEventListener('pointerup', onDragEnd);
    item.addEventListener('pointercancel', onDragEnd);

    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      if (!dragState.moved) {
        dragState.moved = true;
        dragState.sourceEl.classList.remove('pressing');
        dragState.sourceEl.classList.add('dragging-source');
      }
    }
    if (!dragState.moved) return;
    dragGhost.classList.add('visible');
    moveGhost(e.clientX, e.clientY);
    highlightDropZone(e.clientX, e.clientY);
  }

  function moveGhost(x, y) {
    dragGhost.style.left = x + 'px';
    dragGhost.style.top = y + 'px';
  }

  function getDropZoneAt(x, y) {
    dropZones.forEach(function (z) {
      z.classList.remove('highlight');
      if (!z.classList.contains('filled')) {
        z.classList.remove('hint-hidden');
      }
    });

    for (var i = 0; i < dropZones.length; i++) {
      var rect = dropZones[i].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        if (!dropZones[i].classList.contains('filled')) {
          dropZones[i].classList.add('hint-hidden');
        }
        dropZones[i].classList.add('highlight');
        return dropZones[i];
      }
    }
    return null;
  }

  function highlightDropZone(x, y) {
    getDropZoneAt(x, y);
  }

  function onDragEnd(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;

    var sourceEl = dragState.sourceEl;
    var wasDragging = dragState.moved;

    sourceEl.classList.remove('pressing');
    sourceEl.classList.remove('dragging-source');
    sourceEl.removeEventListener('pointermove', onDragMove);
    sourceEl.removeEventListener('pointerup', onDragEnd);
    sourceEl.removeEventListener('pointercancel', onDragEnd);

    if (!wasDragging) {
      clearDragGhostClass();
      playSound(dragState.audio);
      dragState = null;
      return;
    }

    clearDragGhostClass();
    clearDropZoneDragState();

    var zone = getDropZoneAt(e.clientX, e.clientY);

    if (zone && getFilledCount() < 4 && !isFoodUsed(dragState.foodId)) {
      var slotIndex = parseInt(zone.dataset.slot, 10);
      if (tableSlots[slotIndex] === null) {
        placeFood(zone, slotIndex, dragState.image, dragState.foodId, sourceEl);
        checkCompletion();
      }
    }

    dragState = null;
  }

  function placeFood(zone, slotIndex, image, foodId, sourceEl) {
    zone.innerHTML = '';
    var img = document.createElement('img');
    img.className = getPlacedFoodClass(foodId);
    img.src = 'image/' + image;
    img.alt = foodId;
    zone.appendChild(img);
    zone.classList.add('filled');
    tableSlots[slotIndex] = { image: image, foodId: foodId };
    usedFoodIds.add(foodId);
    renderFoodTray();

    if (getFilledCount() < 4) {
      playPlacementSound();
    }
  }

  function checkCompletion() {
    if (getFilledCount() === 4 && !completionPlayed) {
      completionPlayed = true;
      diningTable.classList.add('celebrate');

      var randomAudio = pickRandomCompletionAudio();
      playGlowThenVoice(randomAudio);

      setTimeout(function () {
        diningTable.classList.remove('celebrate');
      }, 1200);

      restartBtn.hidden = false;
      restartBtn.classList.add('visible');
    }
  }

  function resetGame() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    tableSlots = [null, null, null, null];
    usedFoodIds = new Set();
    completionPlayed = false;
    dragState = null;

    dropZones.forEach(function (zone) {
      zone.innerHTML = '';
      zone.classList.remove('filled', 'highlight', 'hint-hidden');
    });

    diningTable.classList.remove('celebrate');
    clearDragGhostClass();
    clearDropZoneDragState();

    restartBtn.hidden = true;
    restartBtn.classList.remove('visible');

    renderFoodTray();
  }

  restartBtn.addEventListener('click', resetGame);
  restartBtn.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
  });

  renderFoodTray();
  preloadCompletionSounds();
})();
