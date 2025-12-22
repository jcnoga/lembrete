// ==========================================
// 1. CONFIGURAÇÃO DO FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBhtwWew_DQNX2TZROUShZz4mjK57pRgQk",
    authDomain: "lembrete-d6c15.firebaseapp.com",
    projectId: "lembrete-d6c15",
    storageBucket: "lembrete-d6c15.firebasestorage.app",
    messagingSenderId: "368296869868",
    appId: "1:368296869868:web:7a2c0a91f57de5d3a90ac9",
    measurementId: "G-JE0QH81JG6"
  };

  firebase.initializeApp(firebaseConfig);

  let auth, db;
  try {
      auth = firebase.auth();
      db = firebase.firestore();
  } catch(e) { console.error("Erro Firebase", e); }

  let currentUser = null;
  let appData = { tasks: [] };
  let audioUnlocked = false;

  // Configuração Padrão de Alertas (Default)
  let defaultConfig = {
      alarmStartMin: 15,
      alarmFreqMin: 5,
      alarmOverdueFreq: 10,
      emailDaysBefore: 1,
      emailFreqDays: 1,
      emailOverdueFreq: 1,
      emailOverdueMax: 3
  };

  // Desbloqueia áudio no primeiro clique do usuário
  function enableAudio() {
      if (!audioUnlocked) {
          document.getElementById('audioAlert').load();
          document.getElementById('audioDone').load();
          audioUnlocked = true;
      }
  }

  // ==========================================
  // 2. SISTEMA DE LOGIN & DEFAULTS
  // ==========================================
  if(auth) {
      auth.onAuthStateChanged((user) => {
          if (user) {
              currentUser = user;
              document.getElementById('auth-screen').classList.add('hidden');
              document.getElementById('app-screen').classList.remove('hidden');
              document.getElementById('user-display').textContent = user.email ? user.email.split('@')[0] : "Usuário Google";
              document.getElementById('settings-email').textContent = user.email;
              
              // Carrega configuração de limpeza automática
              const cleanupPref = localStorage.getItem('autoCleanup') === 'true';
              document.getElementById('auto-cleanup-check').checked = cleanupPref;

              // Carrega configuração default de alertas
              loadDefaultSettings();
              
              syncTasks(); 
          } else {
              currentUser = null;
              appData.tasks = [];
              document.getElementById('auth-screen').classList.remove('hidden');
              document.getElementById('app-screen').classList.add('hidden');
          }
      });
  }

  function loadDefaultSettings() {
      const stored = localStorage.getItem('alertConfig');
      if(stored) {
          defaultConfig = JSON.parse(stored);
      }
      // Preenche inputs da tela de settings
      document.getElementById('def-alarm-start').value = defaultConfig.alarmStartMin;
      document.getElementById('def-alarm-freq').value = defaultConfig.alarmFreqMin;
      document.getElementById('def-alarm-over-freq').value = defaultConfig.alarmOverdueFreq;
      document.getElementById('def-mail-days').value = defaultConfig.emailDaysBefore;
      document.getElementById('def-mail-freq').value = defaultConfig.emailFreqDays;
      document.getElementById('def-mail-over-freq').value = defaultConfig.emailOverdueFreq;
      document.getElementById('def-mail-over-max').value = defaultConfig.emailOverdueMax;
  }

  function saveDefaultSettings() {
      defaultConfig = {
          alarmStartMin: parseInt(document.getElementById('def-alarm-start').value) || 15,
          alarmFreqMin: parseInt(document.getElementById('def-alarm-freq').value) || 5,
          alarmOverdueFreq: parseInt(document.getElementById('def-alarm-over-freq').value) || 10,
          emailDaysBefore: parseInt(document.getElementById('def-mail-days').value) || 1,
          emailFreqDays: parseInt(document.getElementById('def-mail-freq').value) || 1,
          emailOverdueFreq: parseInt(document.getElementById('def-mail-over-freq').value) || 1,
          emailOverdueMax: parseInt(document.getElementById('def-mail-over-max').value) || 3
      };
      localStorage.setItem('alertConfig', JSON.stringify(defaultConfig));
      alert("Configurações padrão salvas!");
  }

  function appLogin() {
      const email = document.getElementById('log-email').value;
      const pass = document.getElementById('log-pass').value;
      if(!email || !pass) return alert("Preencha os dados");
      auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
  }

  // LOGIN COM GOOGLE
  function appLoginGoogle() {
      const provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider)
      .then((result) => {
          console.log("Logado com Google", result.user);
          // onAuthStateChanged cuidará do resto
      }).catch((error) => {
          alert("Erro ao logar com Google: " + error.message);
      });
  }

  function appRegister() {
      const email = document.getElementById('reg-email').value;
      const pass = document.getElementById('reg-pass').value;
      if(!email || !pass) return alert("Preencha os dados");
      auth.createUserWithEmailAndPassword(email, pass).then(()=>alert("Criado!")).catch(err => alert(err.message));
  }
  function appResetPassword() {
      const email = document.getElementById('reset-email').value;
      if(!email) return alert("Digite o e-mail");
      auth.sendPasswordResetEmail(email)
          .then(() => {
              alert("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
              toggleAuth('login');
          })
          .catch(err => alert("Erro: " + err.message));
  }
  function appLogout() { auth.signOut(); }
  function toggleAuth(v) {
      document.querySelectorAll('.auth-box').forEach(e=>e.classList.add('hidden'));
      document.getElementById(v === 'login' ? 'login-form' : v === 'register' ? 'register-form' : 'reset-form').classList.remove('hidden');
  }

  // ==========================================
  // 3. SINCRONIA DE DADOS (CLOUD -> APP)
  // ==========================================
  function syncTasks() {
      if(!currentUser) return;
      
      db.collection('users').doc(currentUser.uid).collection('tasks')
          .orderBy('date')
          .onSnapshot(snapshot => {
              appData.tasks = [];
              snapshot.forEach(doc => {
                  let task = doc.data();
                  task.id = doc.id;
                  appData.tasks.push(task);
              });
              refreshViews();
              runAutoCleanup();
          });
  }

  function getLocalDateStr() {
      const d = new Date();
      const offset = d.getTimezoneOffset() * 60000;
      const localDate = new Date(d.getTime() - offset);
      return localDate.toISOString().split('T')[0];
  }

  function saveTask() {
      const title = document.getElementById('t-title').value;
      const desc = document.getElementById('t-desc').value;
      const date = document.getElementById('t-date').value;
      const time = document.getElementById('t-time').value;
      const cat = document.getElementById('t-category').value;
      const val = document.getElementById('t-value').value;
      const sendEmail = document.getElementById('t-send-email').checked;
      const emailAddr = document.getElementById('t-email-addr').value;

      // Configurações de Lembrete
      const remStart = parseInt(document.getElementById('t-rem-start').value);
      const remInt = parseInt(document.getElementById('t-rem-int').value);
      const remOverInt = parseInt(document.getElementById('t-rem-over-int').value);
      
      // Configurações de Email
      const mailDays = parseInt(document.getElementById('t-mail-days').value);
      const mailInt = parseInt(document.getElementById('t-mail-int').value);
      const mailOverInt = parseInt(document.getElementById('t-mail-over-int').value);
      const mailMax = parseInt(document.getElementById('t-mail-max').value);

      if(!title || !date) return alert("Preencha título e data");

      const data = {
          title, 
          description: desc,
          date, time, category: cat, value: val,
          sendEmail, emailAddr,
          userId: currentUser.uid, 
          completed: false,
          
          // Novos campos de configuração
          remStart: isNaN(remStart) ? defaultConfig.alarmStartMin : remStart,
          remInt: isNaN(remInt) ? defaultConfig.alarmFreqMin : remInt,
          remOverInt: isNaN(remOverInt) ? defaultConfig.alarmOverdueFreq : remOverInt,
          
          mailDays: isNaN(mailDays) ? defaultConfig.emailDaysBefore : mailDays,
          mailInt: isNaN(mailInt) ? defaultConfig.emailFreqDays : mailInt,
          mailOverInt: isNaN(mailOverInt) ? defaultConfig.emailOverdueFreq : mailOverInt,
          mailMax: isNaN(mailMax) ? defaultConfig.emailOverdueMax : mailMax,
          
          // Estado
          overdueEmailCount: 0,
          lastAlarmSent: null,
          lastEmailSent: null,
          
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      const id = document.getElementById('t-id').value;
      
      let dbOperation;
      if(id) {
          const existing = appData.tasks.find(t => t.id === id);
          if(existing) {
              data.overdueEmailCount = existing.overdueEmailCount || 0;
              data.lastAlarmSent = existing.lastAlarmSent || null;
              data.lastEmailSent = existing.lastEmailSent || null;
              data.completed = existing.completed; 
          }
          dbOperation = db.collection('users').doc(currentUser.uid).collection('tasks').doc(id).update(data);
      } else {
          dbOperation = db.collection('users').doc(currentUser.uid).collection('tasks').add(data);
      }

      dbOperation.then(async () => {
          if(!id) alert("Tarefa salva!"); 
          closeModal();
      }).catch(err => {
          alert("Erro ao salvar: " + err.message);
      });
  }

  function deleteTask(id, confirmAction = true) {
      if(!confirmAction || confirm("Excluir esta tarefa?")) {
          db.collection('users').doc(currentUser.uid).collection('tasks').doc(id).delete();
      }
  }
  
  function clearAllCompleted() {
      const completedTasks = appData.tasks.filter(t => t.completed);
      if(completedTasks.length === 0) return alert("Nenhuma tarefa concluída para limpar.");
      
      if(confirm(`Tem certeza? Isso apagará ${completedTasks.length} tarefas concluídas permanentemente.`)) {
          let count = 0;
          completedTasks.forEach(t => {
              db.collection('users').doc(currentUser.uid).collection('tasks').doc(t.id).delete();
              count++;
          });
          alert(`${count} tarefas foram removidas.`);
      }
  }

  function toggleTask(id, status) {
      if(!status) { 
          const audio = document.getElementById('audioDone');
          audio.currentTime = 0;
          audio.play().catch(e => console.log("Audio play blocked", e));
      }
      db.collection('users').doc(currentUser.uid).collection('tasks').doc(id).update({ completed: !status });
  }

  // ==========================================
  // 4. LÓGICA DE UI (NAVEGAÇÃO E VIEWS)
  // ==========================================
  let currentView = 'dashboard';
  
  function switchTab(tab) {
      document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
      document.getElementById('nav-'+tab).classList.add('active');
      document.querySelectorAll('.view-section').forEach(e => e.classList.add('hidden'));
      document.getElementById('view-'+tab).classList.remove('hidden');
      currentView = tab;
      refreshViews();
  }

  function refreshViews() {
      if(currentView === 'dashboard') renderDashboard();
      if(currentView === 'tasks') renderTasks();
      if(currentView === 'calendar') renderCalendar();
  }

  function renderDashboard() {
      const listEl = document.getElementById('dashboard-list');
      const todayStr = getLocalDateStr();
      const pendingTasks = appData.tasks.filter(t => !t.completed);
      
      document.getElementById('stat-pending').textContent = pendingTasks.length;

      const toReceive = pendingTasks
          .filter(t => t.category === 'Cliente' && t.value)
          .reduce((sum, t) => sum + parseFloat(t.value), 0);
      document.getElementById('stat-revenue').textContent = `R$ ${toReceive.toFixed(2)}`;

      const toPay = pendingTasks
          .filter(t => t.category === 'Fornecedor' && t.value)
          .reduce((sum, t) => sum + parseFloat(t.value), 0);
      const elExpense = document.getElementById('stat-expense');
      if(elExpense) elExpense.textContent = `R$ ${toPay.toFixed(2)}`;

      const todaysTasks = appData.tasks.filter(t => t.date === todayStr && !t.completed);
      listEl.innerHTML = '';
      if(todaysTasks.length === 0) {
          listEl.innerHTML = '<div class="empty-state">Nada pendente para hoje!</div>';
          return;
      }
      todaysTasks.forEach(t => listEl.appendChild(createTaskElement(t)));
  }

  function renderTasks() {
      const listEl = document.getElementById('tasks-list');
      const filterCat = document.getElementById('filter-category').value;
      const searchTerm = document.getElementById('task-search').value.toLowerCase().trim();
      
      listEl.innerHTML = '';
      let tasks = [...appData.tasks];
      
      if(filterCat !== 'all') tasks = tasks.filter(t => (t.category || "") === filterCat);
      if(searchTerm !== '') tasks = tasks.filter(t => (t.title && t.title.toLowerCase().includes(searchTerm)));

      tasks.sort((a, b) => {
          if (a.completed === b.completed) return new Date(a.date) - new Date(b.date);
          return a.completed ? 1 : -1;
      });
      
      if(tasks.length === 0) {
          listEl.innerHTML = '<div class="empty-state">Nenhuma tarefa encontrada.</div>';
          return;
      }
      tasks.forEach(t => listEl.appendChild(createTaskElement(t)));
  }

  function createTaskElement(t) {
      const div = document.createElement('div');
      div.className = `task-item ${t.completed ? 'done' : ''} priority-normal`;
      
      const waMsg = encodeURIComponent(`${t.title} - ${t.date} ${t.time}`);
      const waBtn = `<button class="btn-icon btn-wa" onclick="window.open('https://wa.me/?text=${waMsg}')">💬</button>`;
      
      div.innerHTML = `
          <div class="task-info" onclick="openEditModal('${t.id}')">
              <span class="task-title">${t.sendEmail?'📧':''} ${t.title}</span>
              <div class="task-meta">
                  <span>📅 ${formatDateBR(t.date)} ${t.time||''}</span>
                  ${t.category ? `<span class="tag">${t.category}</span>` : ''}
                  ${t.value ? `<span class="tag" style="color:green">R$ ${t.value}</span>` : ''}
              </div>
          </div>
          <div class="task-actions">
              ${waBtn}
              <button class="btn-icon" onclick="toggleTask('${t.id}', ${t.completed})">${t.completed?'↩️':'✅'}</button>
              <button class="btn-icon" onclick="deleteTask('${t.id}')" style="color:var(--danger)">🗑️</button>
          </div>
      `;
      return div;
  }

  let displayMonth = new Date().getMonth();
  let displayYear = new Date().getFullYear();

  function renderCalendar() {
      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      document.getElementById('calendar-month-year').textContent = `${monthNames[displayMonth]} ${displayYear}`;
      const daysContainer = document.getElementById('calendar-days');
      daysContainer.innerHTML = '';

      const firstDay = new Date(displayYear, displayMonth, 1);
      const lastDay = new Date(displayYear, displayMonth + 1, 0);

      for(let i=0; i<firstDay.getDay(); i++) daysContainer.appendChild(document.createElement('div'));

      for(let i=1; i<=lastDay.getDate(); i++) {
          const dStr = `${displayYear}-${String(displayMonth+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
          const el = document.createElement('div');
          el.className = 'cal-day';
          el.textContent = i;
          if(appData.tasks.some(t => t.date === dStr && !t.completed)) el.classList.add('has-task');
          if(dStr === getLocalDateStr()) el.classList.add('today');
          el.onclick = () => {
              const list = document.getElementById('calendar-task-list');
              list.innerHTML = '';
              const tasks = appData.tasks.filter(t => t.date === dStr);
              if(tasks.length === 0) list.innerHTML = 'Nada neste dia.';
              else tasks.forEach(t => list.appendChild(createTaskElement(t)));
          };
          daysContainer.appendChild(el);
      }
  }
  function changeMonth(o) {
      displayMonth += o;
      if(displayMonth>11) { displayMonth=0; displayYear++; }
      if(displayMonth<0) { displayMonth=11; displayYear--; }
      renderCalendar();
  }

  // ==========================================
  // 5. ALARMES E EMAILS AUTOMÁTICOS
  // ==========================================
  setInterval(checkAlarms, 10000);

  function checkAlarms() {
      if(!currentUser) return;
      const now = new Date();
      const todayStr = getLocalDateStr();

      appData.tasks.forEach(task => {
          if(task.completed) return; 

          // ALARME SONORO
          if(task.time) {
              const taskDateTime = new Date(`${task.date}T${task.time}:00`);
              const diffMs = taskDateTime - now;
              const diffMin = diffMs / 60000; 

              const startMin = task.remStart || defaultConfig.alarmStartMin;
              const freqMin = task.remInt || defaultConfig.alarmFreqMin;
              const overFreqMin = task.remOverInt || defaultConfig.alarmOverdueFreq;
              
              let shouldTrigger = false;
              let triggerType = "";

              if (diffMin > 0 && diffMin <= startMin) {
                  if (isIntervalPassed(task.lastAlarmSent, freqMin * 60000)) {
                      shouldTrigger = true;
                      triggerType = `Faltam ${Math.ceil(diffMin)} min`;
                  }
              }
              
              if (diffMin < -1) { 
                  if (isIntervalPassed(task.lastAlarmSent, overFreqMin * 60000)) {
                      shouldTrigger = true;
                      triggerType = "ATRASADO!";
                  }
              }

              if (Math.abs(diffMin) <= 0.5 && (!task.lastAlarmSent || (now - new Date(task.lastAlarmSent).getTime() > 60000))) {
                   shouldTrigger = true;
                   triggerType = "É AGORA!";
              }

              if (shouldTrigger) {
                  triggerAlarm(task, triggerType);
                  db.collection('users').doc(currentUser.uid).collection('tasks').doc(task.id).update({
                      lastAlarmSent: now.toISOString()
                  });
              }
          }

          // EMAIL
          if (task.sendEmail && task.emailAddr) {
              const taskDate = new Date(`${task.date}T00:00:00`); 
              const todayDate = new Date(`${todayStr}T00:00:00`); 
              
              const diffTime = taskDate.getTime() - todayDate.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

              const mailStartDays = task.mailDays || defaultConfig.emailDaysBefore;
              const mailFreqDays = task.mailInt || defaultConfig.emailFreqDays;
              const mailOverFreq = task.mailOverInt || defaultConfig.emailOverdueFreq;
              const mailMax = task.mailMax || defaultConfig.emailOverdueMax;
              const overdueCount = task.overdueEmailCount || 0;

              let shouldSend = false;
              let subjectPrefix = "";

              if (diffDays >= 0 && diffDays <= mailStartDays) {
                  if (isIntervalPassed(task.lastEmailSent, mailFreqDays * 86400000)) {
                      shouldSend = true;
                      subjectPrefix = diffDays === 0 ? "HOJE:" : "Lembrete:";
                  }
              }

              if (diffDays < 0) {
                  if (overdueCount < mailMax) {
                      if (isIntervalPassed(task.lastEmailSent, mailOverFreq * 86400000)) {
                          shouldSend = true;
                          subjectPrefix = "ATRASADO:";
                      }
                  }
              }

              if (shouldSend) {
                  sendEmail(task, subjectPrefix, diffDays < 0);
              }
          }
      });
  }

  function isIntervalPassed(lastStr, intervalMs) {
      if (!lastStr) return true;
      const last = new Date(lastStr).getTime();
      const now = new Date().getTime();
      return (now - last) >= intervalMs;
  }

  function sendEmail(task, subjectPrefix, isOverdue) {
      const nowIso = new Date().toISOString();
      let updateData = { lastEmailSent: nowIso };
      if (isOverdue) {
          updateData.overdueEmailCount = (task.overdueEmailCount || 0) + 1;
      }

      db.collection('users').doc(currentUser.uid).collection('tasks').doc(task.id).update(updateData);

      let htmlContent = `
          <div style="font-family: Arial, sans-serif; color: #333;">
              <h2 style="color: ${isOverdue ? '#e74c3c' : '#0066cc'};">${subjectPrefix} ${task.title}</h2>
              <p>Olá! Detalhes do seu compromisso:</p>
              <hr>
              <p><strong>Descrição:</strong> ${task.description || 'Sem detalhes.'}</p>
              <p><strong>Data:</strong> ${formatDateBR(task.date)} ${task.time || ''}</p>
      `;
      if (task.value) { htmlContent += `<p><strong>Valor:</strong> R$ ${task.value}</p>`; }
      htmlContent += `
              <hr>
              <small>Compromisso Fácil Cloud Pro.</small>
          </div>
      `;

      fetch('https://enviaremailsdiarios-368296869868.southamerica-east1.run.app/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              to: task.emailAddr,
              subject: `${subjectPrefix} ${task.title}`,
              html: htmlContent
          })
      }).then(() => console.log("Email enviado para " + task.title))
        .catch(err => console.error("Erro envio email", err));
  }

  function triggerAlarm(task, typeText) {
      const audio = document.getElementById('audioAlert');
      audio.currentTime = 0;
      audio.play().catch(()=>{});

      document.getElementById('alarm-context').textContent = typeText;
      document.getElementById('alarm-task-id').value = task.id;
      document.getElementById('alarm-time-display').textContent = task.time;
      document.getElementById('alarm-text-display').textContent = task.title;
      document.getElementById('alarmModal').classList.add('active');
      
      if(Notification.permission==="granted") new Notification(`${typeText}: ${task.title}`);
  }

  function stopAlarm() {
      document.getElementById('alarmModal').classList.remove('active');
      document.getElementById('audioAlert').pause();
  }

  function completeTaskFromAlarm() {
      const id = document.getElementById('alarm-task-id').value;
      const audio = document.getElementById('audioDone');
      audio.currentTime = 0;
      audio.play().catch(()=>{});
      db.collection('users').doc(currentUser.uid).collection('tasks').doc(id).update({ completed: true });
      stopAlarm();
  }

  // ==========================================
  // 6. BACKUP, RESTAURAÇÃO E LIMPEZA
  // ==========================================
  function backupData() {
      if(appData.tasks.length === 0) return alert("Nada para salvar.");
      const dataStr = JSON.stringify(appData.tasks, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split('T')[0];
      a.download = `backup_compromissos_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  }

  function triggerRestore() {
      document.getElementById('restore-input').click();
  }

  function restoreData(input) {
      const file = input.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const tasks = JSON.parse(e.target.result);
              if(!Array.isArray(tasks)) return alert("Arquivo inválido!");
              if(confirm(`Tem certeza? Isso irá adicionar ${tasks.length} tarefas à sua conta.`)) {
                  tasks.forEach(t => {
                      delete t.id; 
                      db.collection('users').doc(currentUser.uid).collection('tasks').add(t);
                  });
                  alert("Restauração iniciada!");
              }
          } catch(err) { alert("Erro ao ler arquivo: " + err); }
      };
      reader.readAsText(file);
      input.value = ''; 
  }

  function toggleCleanup(chk) {
      localStorage.setItem('autoCleanup', chk.checked);
      if(chk.checked) runAutoCleanup();
  }

  function runAutoCleanup() {
      const isEnabled = localStorage.getItem('autoCleanup') === 'true';
      if(!isEnabled || !appData.tasks) return;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30); 
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const oldTasks = appData.tasks.filter(t => t.completed && t.date < cutoffStr);

      if (oldTasks.length > 0) {
          if(confirm(`Limpeza Automática: Existem ${oldTasks.length} tarefas concluídas há mais de 30 dias. Deseja apagá-las para liberar espaço?`)) {
              let count = 0;
              oldTasks.forEach(t => {
                  db.collection('users').doc(currentUser.uid).collection('tasks').doc(t.id).delete();
                  count++;
              });
              console.log(`Limpeza automática: ${count} removidas.`);
          }
      }
  }
  
  // ==========================================
  // 7. GERAÇÃO DE PIX COPIA E COLA
  // ==========================================
  const PIX_KEY_GLOBAL = "b4648948-d0a8-4402-81f4-8a4047fcf4e5";
  
  function crc16(str) {
      let crc = 0xFFFF;
      for (let i = 0; i < str.length; i++) {
          crc ^= str.charCodeAt(i) << 8;
          for (let j = 0; j < 8; j++) {
              if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
              else crc = crc << 1;
          }
      }
      return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  function createPixPayload(amount) {
      const format = (id, val) => id + val.length.toString().padStart(2, '0') + val;
      const merchantInfo = format('00', 'BR.GOV.BCB.PIX') + format('01', PIX_KEY_GLOBAL);
      let payload = 
          format('00', '01') + 
          format('26', merchantInfo) + 
          format('52', '0000') + 
          format('53', '986');
      if (amount > 0) payload += format('54', amount.toFixed(2));
      payload += format('58', 'BR') + format('59', 'App Compromisso') + format('60', 'Cidade') + format('62', format('05', '***'));
      payload += '6304';
      payload += crc16(payload);
      return payload;
  }

  function generatePixCopyPaste(amount) {
      const code = createPixPayload(amount);
      copyToClipboard(code, "Pix Copia e Cola (R$ "+amount+",00) copiado!");
      const disp = document.getElementById('pix-display-area');
      disp.style.display = 'block';
      disp.textContent = code;
  }

  function copyPixSimpleKey() {
      copyToClipboard(PIX_KEY_GLOBAL, "Chave Pix copiada!");
      const disp = document.getElementById('pix-display-area');
      disp.style.display = 'block';
      disp.textContent = PIX_KEY_GLOBAL;
  }

  function copyToClipboard(text, msg) {
      navigator.clipboard.writeText(text).then(() => {
          const feed = document.getElementById('pix-feedback');
          feed.textContent = "✅ " + msg;
          feed.style.display = 'block';
          setTimeout(() => feed.style.display = 'none', 4000);
      }).catch(err => alert("Erro ao copiar: " + text));
  }

  function openSupportModal() {
      document.getElementById('pix-display-area').style.display = 'none';
      document.getElementById('pix-feedback').style.display = 'none';
      document.getElementById('supportModal').classList.add('open');
  }
  function closeSupportModal() {
      document.getElementById('supportModal').classList.remove('open');
  }

  // --- UI HELPERS ---
  function openModal() {
      document.getElementById('taskModal').classList.add('open');
      document.getElementById('t-id').value = '';
      
      // Limpa campos
      document.getElementById('t-title').value = '';
      document.getElementById('t-desc').value = ''; 
      document.getElementById('t-date').value = ''; 
      document.getElementById('t-time').value = '';
      document.getElementById('t-category').value = '';
      document.getElementById('t-value').value = '';
      document.getElementById('t-email-addr').value = '';
      document.getElementById('t-send-email').checked = false;
      
      // CARREGA DEFAULTS
      document.getElementById('t-rem-start').value = defaultConfig.alarmStartMin;
      document.getElementById('t-rem-int').value = defaultConfig.alarmFreqMin;
      document.getElementById('t-rem-over-int').value = defaultConfig.alarmOverdueFreq;
      document.getElementById('t-mail-days').value = defaultConfig.emailDaysBefore;
      document.getElementById('t-mail-int').value = defaultConfig.emailFreqDays;
      document.getElementById('t-mail-over-int').value = defaultConfig.emailOverdueFreq;
      document.getElementById('t-mail-max').value = defaultConfig.emailOverdueMax;
      
      toggleEmailInput();
  }

  function openEditModal(id) {
      const t = appData.tasks.find(x => x.id === id);
      if(!t) return;
      document.getElementById('t-id').value = t.id;
      document.getElementById('t-title').value = t.title;
      document.getElementById('t-desc').value = t.description || ''; 
      document.getElementById('t-date').value = t.date;
      document.getElementById('t-time').value = t.time;
      document.getElementById('t-category').value = t.category||'';
      document.getElementById('t-value').value = t.value||'';
      document.getElementById('t-send-email').checked = t.sendEmail;
      document.getElementById('t-email-addr').value = t.emailAddr||'';
      
      // Configs
      document.getElementById('t-rem-start').value = t.remStart || defaultConfig.alarmStartMin;
      document.getElementById('t-rem-int').value = t.remInt || defaultConfig.alarmFreqMin;
      document.getElementById('t-rem-over-int').value = t.remOverInt || defaultConfig.alarmOverdueFreq;
      document.getElementById('t-mail-days').value = t.mailDays || defaultConfig.emailDaysBefore;
      document.getElementById('t-mail-int').value = t.mailInt || defaultConfig.emailFreqDays;
      document.getElementById('t-mail-over-int').value = t.mailOverInt || defaultConfig.emailOverdueFreq;
      document.getElementById('t-mail-max').value = t.mailMax || defaultConfig.emailOverdueMax;

      toggleEmailInput();
      document.getElementById('taskModal').classList.add('open');
  }
  
  function closeModal() { document.getElementById('taskModal').classList.remove('open'); }
  function toggleEmailInput() { 
      const chk = document.getElementById('t-send-email').checked; 
      document.getElementById('div-email-input').classList.toggle('hidden', !chk);
  }
  function formatDateBR(d) { return d.split('-').reverse().join('/'); }
  function exportPDF() {
      if(!window.jspdf) return alert("Carregando libs...");
      const doc = new window.jspdf.jsPDF();
      doc.text("Relatório Tarefas", 10, 10);
      const rows = appData.tasks.map(t=>[formatDateBR(t.date), t.title, t.completed?'OK':'Pending']);
      doc.autoTable({ head:[['Data','Tarefa','Status']], body:rows });
      doc.save('relatorio.pdf');
  }

  const hr = new Date().getHours();
  document.getElementById('greeting').textContent = hr<12?"Bom dia!":hr<18?"Boa tarde!":"Boa noite!";
  if("Notification" in window) Notification.requestPermission();