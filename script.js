(function () {
  'use strict';

  var FASES = [
    { chave: 'inspire', nome: 'Inspire', segundos: 4 },
    { chave: 'segure',  nome: 'Segure',  segundos: 2 },
    { chave: 'expire',  nome: 'Expire',  segundos: 6 }
  ];
  var CICLOS_POR_RODADA = 5;
  var ESCALA_MIN = 0.6;
  var ESCALA_MAX = 1;
  var TONS = { inspire: 523.25, segure: 659.25, expire: 392.0 };

  var corpo = document.body;
  var circulo = document.getElementById('circulo');
  var numero = document.getElementById('numero');
  var textoFase = document.getElementById('fase');
  var textoProgresso = document.getElementById('progresso');
  var textoTotal = document.getElementById('total');
  var btnIniciar = document.getElementById('btn-iniciar');
  var btnReiniciar = document.getElementById('btn-reiniciar');
  var btnSom = document.getElementById('btn-som');

  var rodando = false;
  var indice = 0;
  var inicioFase = 0;   // performance.now() em que a fase atual começou
  var pausadoEm = null; // performance.now() da pausa (null = não está pausado)
  var ciclosRodada = 0; // ciclos concluídos na rodada atual
  var ciclosTotal = 0;  // ciclos concluídos desde que a página foi aberta
  var intervalo = null;
  var audio = null;
  var wakeLock = null;
  var somLigado = lerPreferenciaSom();

  // Suaviza o crescimento/encolhimento do círculo.
  function suavizar(p) {
    return 0.5 - Math.cos(Math.PI * p) / 2;
  }

  function escalaPara(fase, progresso) {
    var p = suavizar(Math.min(1, Math.max(0, progresso)));
    if (fase.chave === 'inspire') return ESCALA_MIN + (ESCALA_MAX - ESCALA_MIN) * p;
    if (fase.chave === 'expire') return ESCALA_MAX - (ESCALA_MAX - ESCALA_MIN) * p;
    return ESCALA_MAX;
  }

  function mostrarFase() {
    var fase = FASES[indice];
    corpo.setAttribute('data-fase', fase.chave);
    textoFase.textContent = fase.nome;
  }

  function mostrarProgresso() {
    textoProgresso.textContent = 'Ciclo ' + (ciclosRodada + 1) + ' de ' + CICLOS_POR_RODADA;
  }

  function desenhar(fase, decorridoMs) {
    var duracaoMs = fase.segundos * 1000;
    var restante = Math.max(1, Math.ceil((duracaoMs - decorridoMs) / 1000));
    if (numero.textContent !== String(restante)) numero.textContent = restante;
    circulo.style.transform = 'scale(' + escalaPara(fase, decorridoMs / duracaoMs) + ')';
  }

  // Avança o tempo com base no relógio real, então não acumula atraso.
  function atualizar() {
    if (!rodando) return;
    var agora = performance.now();
    var fase = FASES[indice];
    var mudou = false;

    while (agora - inicioFase >= fase.segundos * 1000) {
      inicioFase += fase.segundos * 1000;
      indice = (indice + 1) % FASES.length;
      if (indice === 0) {
        ciclosRodada++;
        ciclosTotal++;
        textoTotal.textContent = ciclosTotal;
        if (ciclosRodada >= CICLOS_POR_RODADA) {
          concluir();
          return;
        }
        mostrarProgresso();
      }
      fase = FASES[indice];
      mudou = true;
    }

    if (mudou) {
      mostrarFase();
      tocar(fase.chave);
    }
    desenhar(fase, agora - inicioFase);
  }

  function animar() {
    if (!rodando) return;
    atualizar();
    requestAnimationFrame(animar);
  }

  function iniciar() {
    if (rodando) return;
    prepararAudio();
    var agora = performance.now();

    if (pausadoEm !== null) {
      inicioFase += agora - pausadoEm;
      pausadoEm = null;
      mostrarFase();
    } else {
      indice = 0;
      ciclosRodada = 0;
      inicioFase = agora;
      mostrarFase();
      mostrarProgresso();
      tocar(FASES[0].chave);
    }

    rodando = true;
    btnIniciar.textContent = 'Pausar';
    // O intervalo mantém o som funcionando mesmo com a aba em segundo plano.
    intervalo = setInterval(atualizar, 200);
    requestAnimationFrame(animar);
    manterTelaLigada(true);
  }

  function pausar() {
    if (!rodando) return;
    atualizar();
    rodando = false;
    pausadoEm = performance.now();
    clearInterval(intervalo);
    btnIniciar.textContent = 'Continuar';
    textoFase.textContent = 'Pausado';
    manterTelaLigada(false);
  }

  // Para tudo e deixa pronto para uma nova rodada.
  // O total de ciclos (canto superior direito) não é zerado.
  function voltarAoInicio(rotulo) {
    rodando = false;
    pausadoEm = null;
    clearInterval(intervalo);
    indice = 0;
    ciclosRodada = 0;
    corpo.setAttribute('data-fase', 'inspire');
    numero.textContent = FASES[0].segundos;
    textoFase.textContent = rotulo;
    circulo.style.transform = 'scale(' + ESCALA_MIN + ')';
    btnIniciar.textContent = 'Iniciar';
    manterTelaLigada(false);
  }

  function reiniciar() {
    voltarAoInicio('Pronto');
    textoProgresso.textContent = 'Rodada de ' + CICLOS_POR_RODADA + ' ciclos';
  }

  // Chamado ao fim do 5º ciclo: é preciso clicar em Iniciar de novo.
  function concluir() {
    voltarAoInicio('Concluído');
    textoProgresso.textContent = 'Rodada concluída';
    tocarFim();
  }

  function alternar() {
    if (rodando) pausar();
    else iniciar();
  }

  // ---- Som (gerado pelo navegador, não precisa de arquivos) ----

  function prepararAudio() {
    if (!somLigado) return;
    try {
      var Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return;
      if (!audio) audio = new Contexto();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) {
      audio = null;
    }
  }

  function tocar(chave) {
    tocarTom(TONS[chave], 0);
  }

  // Três notas descendentes avisam que a rodada terminou.
  function tocarFim() {
    tocarTom(659.25, 0);
    tocarTom(523.25, 0.35);
    tocarTom(392.0, 0.7);
  }

  function tocarTom(frequencia, atraso) {
    if (!somLigado || !audio) return;
    try {
      var t = audio.currentTime + atraso;
      var osc = audio.createOscillator();
      var ganho = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequencia;
      ganho.gain.setValueAtTime(0.0001, t);
      ganho.gain.exponentialRampToValueAtTime(0.18, t + 0.04);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(ganho);
      ganho.connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.75);
    } catch (e) {
      // Sem som, o exercício continua normalmente.
    }
  }

  function mostrarSom() {
    btnSom.textContent = somLigado ? 'Som: ligado' : 'Som: desligado';
    btnSom.setAttribute('aria-pressed', somLigado ? 'true' : 'false');
  }

  function lerPreferenciaSom() {
    try {
      return localStorage.getItem('respiracao-som') !== 'desligado';
    } catch (e) {
      return true;
    }
  }

  function salvarPreferenciaSom() {
    try {
      localStorage.setItem('respiracao-som', somLigado ? 'ligado' : 'desligado');
    } catch (e) {
      // Ignora: a preferência só não fica salva.
    }
  }

  // ---- Mantém a tela acesa durante o exercício (quando suportado) ----

  function manterTelaLigada(ligar) {
    if (!('wakeLock' in navigator)) return;
    if (ligar && !wakeLock) {
      navigator.wakeLock.request('screen').then(function (trava) {
        wakeLock = trava;
        trava.addEventListener('release', function () { wakeLock = null; });
      }).catch(function () { wakeLock = null; });
    } else if (!ligar && wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && rodando) manterTelaLigada(true);
  });

  // ---- Eventos ----

  btnIniciar.addEventListener('click', alternar);
  btnReiniciar.addEventListener('click', reiniciar);
  btnSom.addEventListener('click', function () {
    somLigado = !somLigado;
    salvarPreferenciaSom();
    mostrarSom();
    prepararAudio();
  });

  // Barra de espaço inicia/pausa (quando o foco não está em um botão).
  document.addEventListener('keydown', function (e) {
    if ((e.code === 'Space' || e.key === ' ') && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      alternar();
    }
  });

  mostrarSom();
  reiniciar();
})();
