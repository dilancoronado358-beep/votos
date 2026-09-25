// ================================================
// INICIALIZACIÓN SEGURA - Todo dentro del DOMContentLoaded
// ================================================
document.addEventListener('DOMContentLoaded', function () {

    // --- Inicializar Supabase de forma segura ---
    let supabase;
    try {
        var supabaseUrl = 'https://bfburrriwaetdxperzsv.supabase.co';
        var supabaseKey = 'sb_publishable_EQsnuLxEKRqskyQJl5WfBg_HrWn0X2F';
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        console.log('Supabase inicializado correctamente');
    } catch (e) {
        alert('Error crítico: No se pudo cargar la librería de base de datos.\n\n' + e.message);
        return;
    }

    // ================================================
    // ESTADO DE LA APLICACIÓN
    // ================================================
    var currentView = 'auth';
    var currentUser = null;

    // ================================================
    // NAVEGACIÓN
    // ================================================
    function navigate(viewId) {
        currentView = viewId;
        document.querySelectorAll('.view').forEach(function(el) { el.classList.remove('active'); });
        var tvBtn = document.getElementById('btn-open-tv-admin');
        if (tvBtn) tvBtn.style.display = 'none';

        if (viewId === 'auth') {
            document.body.classList.add('is-login-screen');
            document.getElementById('view-auth').classList.add('active');
        } else {
            document.body.classList.remove('is-login-screen');
            var viewMap = { 'admin': 'view-admin', 'mesa': 'view-mesa', 'base': 'view-base' };
            var targetId = viewMap[viewId] || 'view-auth';
            document.getElementById(targetId).classList.add('active');
            
            // Set header username
            if (currentUser && currentUser.username) {
                document.querySelectorAll('.header-username').forEach(function(el) {
                    el.textContent = '👤 ' + currentUser.username;
                });
                var fab = document.getElementById('chat-fab');
                if (fab) fab.style.display = 'flex';
                fetchChatMessages();
            } else {
                var fab = document.getElementById('chat-fab');
                if (fab) fab.style.display = 'none';
            }

            if (viewId === 'admin') if (tvBtn) tvBtn.style.display = 'inline-block';
            if (viewId === 'base') renderDashboard();
            if (viewId === 'admin') renderAdminDashboard();
        }
    }

    // ================================================
    // NOTIFICACIONES PUSH (ESCRITORIO)
    // ================================================
    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    function sendPushNotification(title, options) {
        if ('Notification' in window && Notification.permission === 'granted') {
            // Verificar si el documento está visible, para no spamear si ya está viéndolo
            if (document.hidden) {
                var n = new Notification(title, options);
                n.onclick = function() {
                    window.focus();
                    this.close();
                };
            }
        }
    }

    // ================================================
    // VERIFICAR SESIÓN GUARDADA + REALTIME
    // ================================================
    function setupRealtime() {
        // Canal en tiempo real para la tabla votos
        supabase.channel('votos-live')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'votos'
            }, function(payload) {
                if (payload.eventType === 'INSERT') {
                    audioDing.play().catch(function(e) { console.log('Audio autoplay prevent', e); });
                    if (window._isTVMode) _playTVFanfare();
                    var title = '🔔 Nueva Acta - Mesa ' + payload.new.junta_numero;
                    var body = 'Se reportan ' + payload.new.cantidad_votos + ' votos desde ' + (payload.new.establecimiento || 'Recinto Desconocido');
                    showToast(title + ': ' + payload.new.cantidad_votos + ' votos!', 'success');
                    sendPushNotification(title, { body: body, icon: 'https://cdn-icons-png.flaticon.com/512/190/190411.png' });
                }
                if (currentView === 'base') renderDashboard();
                if (currentView === 'admin') renderAdminDashboard();
                if (window._isTVMode) window._refreshTV();
            })
            .subscribe();

        // Canal en tiempo real para Alertas SOS
        supabase.channel('alertas-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, function(payload) {
                if (payload.eventType === 'INSERT') {
                    var a = payload.new;
                    audioSiren.loop = true;
                    audioSiren.play().catch(function(e){ console.log('Siren prevent', e); });
                    document.getElementById('sos-alert-text').textContent = 'Recinto: ' + a.establecimiento;
                    document.getElementById('sos-alert-banner').style.display = 'block';
                    sendPushNotification('🚨 ALERTA SOS 🚨', { body: a.establecimiento + ': ' + a.mensaje, icon: 'https://cdn-icons-png.flaticon.com/512/564/564276.png' });
                }
                fetchAlertasActivas();
                if (window._isTVMode) window._refreshTV();
            })
            .subscribe();

        // Canal en tiempo real para chat
        supabase.channel('chat-live')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, async function(payload) {
                // Obtenemos el nombre del usuario
                var usrRes = await supabase.from('usuarios').select('username').eq('id', payload.new.user_id).single();
                var msgWithUser = Object.assign({}, payload.new);
                msgWithUser.usuarios = { username: usrRes.data ? usrRes.data.username : 'Usuario' };
                
                if (window._appendChatMessage) {
                    window._appendChatMessage(msgWithUser);
                }
                
                // Mostrar notificación si el chat está cerrado o en background
                var panel = document.getElementById('chat-panel');
                if (panel && !panel.classList.contains('active')) {
                    var fab = document.getElementById('chat-fab');
                    if (fab) fab.classList.add('has-unread');
                    audioDing.play().catch(function(e){});
                    sendPushNotification('💬 Mensaje War Room', { body: msgWithUser.usuarios.username + ': ' + payload.new.mensaje, icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png' });
                } else if (document.hidden) {
                    sendPushNotification('💬 Mensaje War Room', { body: msgWithUser.usuarios.username + ': ' + payload.new.mensaje, icon: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png' });
                }
            })
            .subscribe();
    }

    try {
        var stored = localStorage.getItem('appUser');
        if (stored) {
            var parsed = JSON.parse(stored);
            if (parsed && parsed.role) {
                currentUser = parsed;
                navigate(parsed.role);
                // Pequeño delay para asegurar que el DOM está activo antes de cargar datos
                setTimeout(function() {
                    if (parsed.role === 'admin') renderAdminDashboard();
                    if (parsed.role === 'base') renderDashboard();
                }, 100);
            } else {
                localStorage.removeItem('appUser');
            }
        }
    } catch (e2) {
        localStorage.removeItem('appUser');
    }

    window.fetchAlertasActivas = async function() {
        var panel = document.getElementById('panel-alertas-base');
        var lista = document.getElementById('lista-alertas-base');
        if (!panel || !lista) return;

        try {
            var res = await supabase.from('alertas').select('*, usuarios(username)').eq('resuelta', false).order('created_at', { ascending: false });
            if (res.error) throw res.error;
            var data = res.data || [];
            
            if (data.length === 0) {
                panel.style.display = 'none';
                lista.innerHTML = '';
            } else {
                panel.style.display = 'block';
                var html = '';
                data.forEach(function(a) {
                    var user = a.usuarios ? a.usuarios.username : 'Desconocido';
                    var h = new Date(a.created_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                    html += `
                        <div style="background:rgba(255,255,255,0.8); padding:12px; border-radius:8px; border-left:4px solid var(--danger);">
                            <div style="font-weight:bold; color:var(--danger); font-size:1rem;">📌 ${a.establecimiento}</div>
                            <div style="font-size:0.85rem; color:var(--text); margin-top:4px;">💬 ${a.mensaje}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">👤 ${user} &bull; ⏱️ ${h}</div>
                        </div>
                    `;
                });
                lista.innerHTML = html;
            }
        } catch (e) {
            console.error('Error fetching alertas:', e);
        }
    };

    // Activar Realtime siempre (para cualquier rol logueado)
    setupRealtime();
    fetchAlertasActivas(); // Primera carga de alertas


    // ================================================
    // LOGIN
    // ================================================
    // ================================================
    // MOTOR DE SONIDO (Web Audio API)
    // ================================================
    var _audioCtx = null;
    function _getAudioCtx() {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
        return _audioCtx;
    }
    // Habilitar audio tras primer click (politica de navegadores)
    document.addEventListener('click', function() { _getAudioCtx(); }, { once: true });
    
    // Un "pop" muy suave para notificaciones normales
    var audioDing = {
        play: function() {
            return new Promise(function(resolve) {
                try {
                    var ctx = _getAudioCtx();
                    var o = ctx.createOscillator(); var g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.type = 'sine';
                    o.frequency.setValueAtTime(600, ctx.currentTime);
                    g.gain.setValueAtTime(0, ctx.currentTime);
                    g.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2);
                    resolve();
                } catch(e) { resolve(); }
            });
        }
    };
    
    var _sirenInterval = null;
    var _sirenTimeout = null;
    // Un doble-tap suave para SOS (nada de sirenas estridentes)
    var audioSiren = {
        loop: true,
        play: function() {
            return new Promise(function(resolve) {
                try {
                    var ctx = _getAudioCtx();
                    var burst = function() {
                        var t = ctx.currentTime;
                        // Primer tap
                        var o1 = ctx.createOscillator(); var g1 = ctx.createGain();
                        o1.connect(g1); g1.connect(ctx.destination);
                        o1.type = 'sine'; o1.frequency.setValueAtTime(400, t);
                        g1.gain.setValueAtTime(0, t);
                        g1.gain.linearRampToValueAtTime(0.15, t + 0.02);
                        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                        o1.start(t); o1.stop(t + 0.2);
                        
                        // Segundo tap
                        var o2 = ctx.createOscillator(); var g2 = ctx.createGain();
                        o2.connect(g2); g2.connect(ctx.destination);
                        o2.type = 'sine'; o2.frequency.setValueAtTime(400, t + 0.2);
                        g2.gain.setValueAtTime(0, t + 0.2);
                        g2.gain.linearRampToValueAtTime(0.15, t + 0.22);
                        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                        o2.start(t + 0.2); o2.stop(t + 0.4);
                    };
                    burst();
                    if (audioSiren.loop && !_sirenInterval) {
                        _sirenInterval = setInterval(burst, 1200);
                        if (_sirenTimeout) clearTimeout(_sirenTimeout);
                        _sirenTimeout = setTimeout(function() {
                            audioSiren.pause();
                        }, 3000); 
                    }
                    resolve();
                } catch(e) { resolve(); }
            });
        },
        pause: function() {
            if (_sirenInterval) { clearInterval(_sirenInterval); _sirenInterval = null; }
            if (_sirenTimeout) { clearTimeout(_sirenTimeout); _sirenTimeout = null; }
        }
    };
    
    // Un acorde muy sutil para Modo TV
    function _playTVFanfare() {
        try {
            var ctx = _getAudioCtx();
            [440, 554, 659].forEach(function(freq, i) { // A mayor suave
                var o = ctx.createOscillator(); var g = ctx.createGain();
                o.connect(g); g.connect(ctx.destination);
                var t = ctx.currentTime + i * 0.08;
                o.type = 'sine';
                o.frequency.setValueAtTime(freq, t);
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.05, t + 0.05); // Volumen muy bajo (0.05)
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                o.start(t); o.stop(t + 0.5);
            });
        } catch(e) {}
    }

    // ================================================
    // ACEPTACIÓN LEGAL (Términos + Privacidad)
    // ================================================

    // Forzar reset al cargar (el navegador puede recordar el estado)
    (function() {
        var chkT = document.getElementById('chk-terminos');
        var chkP = document.getElementById('chk-privacidad');
        var btn  = document.getElementById('btn-login');
        if (chkT) chkT.checked = false;
        if (chkP) chkP.checked = false;
        if (btn)  { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
    })();

    window._checkLegalBoxes = function() {
        var chkT = document.getElementById('chk-terminos');
        var chkP = document.getElementById('chk-privacidad');
        var btn  = document.getElementById('btn-login');
        if (!chkT || !chkP || !btn) return;
        var allChecked = chkT.checked && chkP.checked;
        btn.disabled = !allChecked;
        btn.style.opacity    = allChecked ? '1'            : '0.5';
        btn.style.cursor     = allChecked ? 'pointer'      : 'not-allowed';
        btn.style.transform  = allChecked ? 'scale(1)'     : 'scale(1)';
    };

    window._openLegal = function(type) {
        var modalId = type === 'terminos' ? 'modal-terminos' : 'modal-privacidad';
        var modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'block';
    };

    // Cerrar modales legales al hacer clic en el fondo
    document.addEventListener('click', function(e) {
        var modalT = document.getElementById('modal-terminos');
        var modalP = document.getElementById('modal-privacidad');
        if (e.target === modalT) modalT.style.display = 'none';
        if (e.target === modalP) modalP.style.display = 'none';
    });

    async function login() {
        var username = document.getElementById('login-email').value.trim();
        var password = document.getElementById('login-password').value;
        var btn = document.getElementById('btn-login');

        if (!username || !password) {
            showToast('Completa todos los campos', 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Iniciando...';

        try {
            var result = await supabase
                .from('usuarios')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (result.error) {
                if (result.error.code === 'PGRST116') {
                    throw new Error('Usuario o contraseña incorrectos');
                }
                throw new Error('Error Supabase: ' + result.error.message);
            }
            if (!result.data) {
                throw new Error('Usuario o contraseña incorrectos');
            }

            currentUser = result.data;
            localStorage.setItem('appUser', JSON.stringify(result.data));
            showToast('¡Bienvenido, ' + result.data.username + '!');
            document.getElementById('form-login').reset();
            requestNotificationPermission(); // Pedir permisos al loguear
            navigate(result.data.role);

        } catch (err) {
            console.error('Login error:', err);
            alert('No se pudo ingresar.\n\nDetalle: ' + err.message + '\n\n¿Ya ejecutaste el SQL en Supabase?');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Ingresar';
        }
    }

    // ================================================
    // CERRAR SESIÓN
    // ================================================
    function logout() {
        localStorage.removeItem('appUser');
        currentUser = null;
        
        var panel = document.getElementById('chat-panel');
        if (panel) panel.classList.remove('active');
        var fab = document.getElementById('chat-fab');
        if (fab) fab.style.display = 'none';

        // Resetear checkboxes legales para nueva sesión
        var chkT = document.getElementById('chk-terminos');
        var chkP = document.getElementById('chk-privacidad');
        var btnLogin = document.getElementById('btn-login');
        if (chkT) chkT.checked = false;
        if (chkP) chkP.checked = false;
        if (btnLogin) { btnLogin.disabled = true; btnLogin.style.opacity = '0.5'; btnLogin.style.cursor = 'not-allowed'; }

        navigate('auth');
        showToast('Sesión cerrada');
    }

    // ================================================
    // CREAR USUARIO (ADMIN)
    // ================================================
    async function adminCreateUser(e) {
        e.preventDefault();
        var username = document.getElementById('new-username').value.trim();
        var password = document.getElementById('new-password').value;
        var role = document.getElementById('new-role').value;
        var btn = e.target.querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.textContent = 'Creando...';

        try {
            var res = await supabase
                .from('usuarios')
                .insert([{ username: username, password: password, role: role }]);

            if (res.error) {
                if (res.error.code === '23505') throw new Error('Ese nombre de usuario ya existe');
                throw res.error;
            }

            showToast('Usuario "' + username + '" creado exitosamente');
            e.target.reset();
        } catch (err) {
            console.error('Error creando usuario:', err);
            showToast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Crear Usuario';
        }
    }

    // ================================================
    // GPS & SOS
    // ================================================
    function getLocation() {
        return new Promise(function(resolve) {
            if (!navigator.geolocation) return resolve({ lat: null, lon: null });
            navigator.geolocation.getCurrentPosition(
                function(pos) { resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
                function() { resolve({ lat: null, lon: null }); },
                { timeout: 5000 }
            );
        });
    }

    window._reportarSOS = async function() {
        if (!currentUser) return showToast('Sesión expirada', 'error');
        var est = document.getElementById('establecimiento-mesa').value || document.getElementById('asistencia-establecimiento').value || 'Desconocido';
        var msg = prompt('🚨 ALERTA SOS: ¿Cuál es la emergencia en el recinto ' + est + '?');
        if (!msg) return;

        try {
            var ins = await supabase.from('alertas').insert([{
                user_id: currentUser.id,
                establecimiento: est,
                mensaje: msg
            }]);
            if (ins.error) throw ins.error;
            showToast('🚨 SOS Enviado. La sede ha sido notificada.', 'success');
        } catch(e) {
            showToast('Error al enviar SOS: ' + e.message, 'error');
        }
    };

    // ================================================
    // SUBIR Y COMPRIMIR ARCHIVO
    // ================================================
    async function compressImage(file) {
        if (!file.type.match(/image.*/)) return file; // Si es PDF no comprimir
        return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var img = new Image();
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    var ctx = canvas.getContext('2d');
                    var MAX_WIDTH = 1200;
                    var MAX_HEIGHT = 1200;
                    var width = img.width;
                    var height = img.height;

                    if (width > height && width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    } else if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(function(blob) {
                        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                    }, 'image/jpeg', 0.8); // 80% calidad
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function fileToBase64(file) {
        return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onloadend = function() { resolve(reader.result); };
            reader.readAsDataURL(file);
        });
    }

    async function uploadFile(file) {
        var compressedFile = await compressImage(file);
        var isCompressed = compressedFile !== file;
        var fileExt = isCompressed ? 'jpg' : file.name.split('.').pop();
        var fileName = Math.random().toString(36).substring(2) + '-' + Date.now() + '.' + fileExt;
        var filePath = 'actas/' + fileName;
        var up = await supabase.storage.from('evidencias').upload(filePath, compressedFile);
        if (up.error) throw up.error;
        var pub = supabase.storage.from('evidencias').getPublicUrl(filePath);
        return pub.data.publicUrl;
    }

    // ================================================
    window._reportarAsistencia = async function() {
        var est = document.getElementById('asistencia-establecimiento').value.trim();
        if (!est) { showToast('Ingresa el nombre del establecimiento', 'error'); return; }
        if (!currentUser) { showToast('Sesión expirada', 'error'); return; }

        var btn = document.getElementById('btn-asistencia');
        btn.disabled = true;
        btn.textContent = 'Enviando...';

        var loc = await getLocation();

        try {
            var payload = { 
                user_id: currentUser.id, 
                establecimiento: est,
                latitud: loc.lat,
                longitud: loc.lon
            };
            var ins = await supabase.from('asistencias').insert([payload]);
            if (ins.error) throw ins.error;
            showToast('✅ Instalación reportada con éxito', 'success');
            document.getElementById('asistencia-establecimiento').value = '';
            btn.textContent = '📍 Asistencia Confirmada';
        } catch(e) {
            showToast('Error: ' + e.message, 'error');
            btn.disabled = false;
            btn.textContent = '📍 Confirmar Asistencia';
        }
    };

    // ================================================
    // ENVIAR VOTO
    // ================================================
    async function submitVote(e) {
        e.preventDefault();
        var establecimiento = document.getElementById('establecimiento-mesa').value.trim();
        var junta = document.getElementById('numero-junta').value;
        var genero = document.getElementById('genero-junta').value;
        var votos = parseInt(document.getElementById('cantidad-votos').value) || 0;
        var blancos = parseInt(document.getElementById('votos-blancos').value) || 0;
        var nulos = parseInt(document.getElementById('votos-nulos').value) || 0;
        var total = parseInt(document.getElementById('total-sufragantes').value) || 0;
        var observaciones = document.getElementById('observaciones').value.trim();
        var fileInput = document.getElementById('evidencia-archivo');
        var btnSubmit = e.target.querySelector('button[type="submit"]');

        // Prefecto
        var prefL4   = parseInt(document.getElementById('pref-l4').value) || 0;
        var prefL7   = parseInt(document.getElementById('pref-l7').value) || 0;
        var prefL63  = parseInt(document.getElementById('pref-l63').value) || 0;
        var prefBlancos = parseInt(document.getElementById('pref-blancos').value) || 0;
        var prefNulos   = parseInt(document.getElementById('pref-nulos').value) || 0;

        // Alcalde (otros candidatos)
        var alcL1    = parseInt(document.getElementById('alc-l1').value) || 0;
        var alcL4    = parseInt(document.getElementById('alc-l4').value) || 0;
        var alcL7    = parseInt(document.getElementById('alc-l7').value) || 0;
        var alcL63   = parseInt(document.getElementById('alc-l63').value) || 0;
        var alcL105  = parseInt(document.getElementById('alc-l105').value) || 0;

        // Concejales Urbanos
        var cuL1    = parseInt(document.getElementById('cu-l1').value) || 0;
        var cuL4    = parseInt(document.getElementById('cu-l4').value) || 0;
        var cuL7    = parseInt(document.getElementById('cu-l7').value) || 0;
        var cuL1718 = parseInt(document.getElementById('cu-l1718').value) || 0;
        var cuL63   = parseInt(document.getElementById('cu-l63').value) || 0;
        var cuL105  = parseInt(document.getElementById('cu-l105').value) || 0;
        var cuBlancos = parseInt(document.getElementById('cu-blancos').value) || 0;
        var cuNulos   = parseInt(document.getElementById('cu-nulos').value) || 0;

        // Concejales Rurales
        var crL1    = parseInt(document.getElementById('cr-l1').value) || 0;
        var crL4    = parseInt(document.getElementById('cr-l4').value) || 0;
        var crL7    = parseInt(document.getElementById('cr-l7').value) || 0;
        var crL1718 = parseInt(document.getElementById('cr-l1718').value) || 0;
        var crL63   = parseInt(document.getElementById('cr-l63').value) || 0;
        var crL105  = parseInt(document.getElementById('cr-l105').value) || 0;
        var crBlancos = parseInt(document.getElementById('cr-blancos').value) || 0;
        var crNulos   = parseInt(document.getElementById('cr-nulos').value) || 0;

        if (!fileInput.files.length) { showToast('Debes adjuntar la evidencia del acta.', 'error'); return; }
        if (!currentUser) { showToast('Tu sesión ha expirado', 'error'); logout(); return; }

        // Anti-fraud validation
        var sum = votos + blancos + nulos;
        if (sum > total) {
            var msg = '⚠️ INCONSISTENCIA DETECTADA:\n' +
                      'Votos (' + votos + ') + Blancos (' + blancos + ') + Nulos (' + nulos + ') = ' + sum + '\n' +
                      'El Padrón es de ' + total + '.\n\n' +
                      'Hay ' + (sum - total) + ' votos de más. ¿Deseas enviar esto con ALERTA ROJA de fraude/error?';
            if (!confirm(msg)) return;
            observaciones = '[ALERTA: Inconsistencia Numérica] ' + observaciones;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Obteniendo GPS y subiendo...';

        var loc = await getLocation();

        try {
            var compressedFile = await compressImage(fileInput.files[0]);

            // OFFLINE MODE: Si no hay internet, guardar en cola local
            if (!navigator.onLine) {
                var b64 = await fileToBase64(compressedFile);
                var queue = JSON.parse(localStorage.getItem('offlineVotesQueue') || '[]');
                queue.push({
                    establecimiento: establecimiento,
                    junta_numero: parseInt(junta),
                    genero: genero,
                    cantidad_votos: votos,
                    votos_blancos: blancos,
                    votos_nulos: nulos,
                    total_sufragantes: total,
                    latitud: loc.lat,
                    longitud: loc.lon,
                    observaciones: observaciones + ' [Enviado Offline]',
                    user_id: currentUser.id,
                    // Prefecto
                    pref_l4: prefL4, pref_l7: prefL7, pref_l63: prefL63,
                    pref_blancos: prefBlancos, pref_nulos: prefNulos,
                    // Alcalde
                    alc_l1: alcL1, alc_l4: alcL4, alc_l7: alcL7,
                    alc_l63: alcL63, alc_l105: alcL105,
                    // Concejales Urbanos
                    cu_l1: cuL1, cu_l4: cuL4, cu_l7: cuL7, cu_l1718: cuL1718, cu_l63: cuL63, cu_l105: cuL105,
                    cu_blancos: cuBlancos, cu_nulos: cuNulos,
                    // Concejales Rurales
                    cr_l1: crL1, cr_l4: crL4, cr_l7: crL7, cr_l1718: crL1718, cr_l63: crL63, cr_l105: crL105,
                    cr_blancos: crBlancos, cr_nulos: crNulos,
                    evidencia_b64: b64,
                    fileName: compressedFile.name
                });
                localStorage.setItem('offlineVotesQueue', JSON.stringify(queue));
                showToast('📴 SIN INTERNET: Voto guardado en cola. Se subirá automáticamente cuando regrese la señal.', 'success');
                e.target.reset();
                return;
            }

            // 1. Check duplicates
            var chk = await supabase.from('votos').select('id, evidencia_url').eq('junta_numero', parseInt(junta)).single();
            var existingId = null;
            if (chk.data) {
                var confirmUpdate = confirm('La Junta ' + junta + ' ya ha sido reportada. ¿Deseas sobreescribir la información anterior?');
                if (!confirmUpdate) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = 'Enviar Resultados';
                    return;
                }
                existingId = chk.data.id;
            }

            btnSubmit.textContent = 'Subiendo (comprimiendo)...';
            var publicUrl = await uploadFile(compressedFile);
            
            var payload = {
                establecimiento: establecimiento,
                junta_numero: parseInt(junta),
                genero: genero,
                cantidad_votos: votos,
                votos_blancos: blancos,
                votos_nulos: nulos,
                total_sufragantes: total,
                latitud: loc.lat,
                longitud: loc.lon,
                observaciones: observaciones,
                evidencia_url: publicUrl,
                user_id: currentUser.id,
                // Prefecto
                pref_l4: prefL4, pref_l7: prefL7, pref_l63: prefL63,
                pref_blancos: prefBlancos, pref_nulos: prefNulos,
                // Alcalde (otros)
                alc_l1: alcL1, alc_l4: alcL4, alc_l7: alcL7,
                alc_l63: alcL63, alc_l105: alcL105,
                // Concejales Urbanos
                cu_l1: cuL1, cu_l4: cuL4, cu_l7: cuL7, cu_l1718: cuL1718, cu_l63: cuL63, cu_l105: cuL105,
                cu_blancos: cuBlancos, cu_nulos: cuNulos,
                // Concejales Rurales
                cr_l1: crL1, cr_l4: crL4, cr_l7: crL7, cr_l1718: crL1718, cr_l63: crL63, cr_l105: crL105,
                cr_blancos: crBlancos, cr_nulos: crNulos
            };

            if (existingId) {
                var upd = await supabase.from('votos').update(payload).eq('id', existingId);
                if (upd.error) throw upd.error;
                showToast('Resultados actualizados correctamente');
            } else {
                var ins = await supabase.from('votos').insert([payload]);
                if (ins.error) throw ins.error;
                showToast('Resultados enviados correctamente');
            }
            
            e.target.reset();
            document.getElementById('genero-junta').value = '';
            document.getElementById('file-name').textContent = 'Toca aquí para seleccionar un archivo';
            document.querySelector('.file-upload-wrapper').classList.remove('has-file');
        } catch (err) {
            console.error('Error al subir:', err);
            showToast('Error: ' + err.message, 'error');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Enviar Resultados';
        }
    }

    // ================================================
    // DASHBOARD & ADMIN STATE
    // ================================================
    var PAGE_SIZE = 10;
    var baseData = [];
    var baseFiltered = [];
    var basePage = 1;

    var usersData = [];
    var usersFiltered = [];
    var usersPage = 1;

    var TOTAL_JUNTAS = 100; // Valor por defecto para la barra de progreso

    // ================================================
    // DASHBOARD (EQUIPO BASE)
    // ================================================
    async function fetchAlertasActivas() {
        var pnlBase = document.getElementById('panel-alertas-base');
        var lstBase = document.getElementById('lista-alertas-base');
        var pnlAdmin = document.getElementById('panel-alertas-admin');
        var lstAdmin = document.getElementById('lista-alertas-admin');

        var res = await supabase.from('alertas').select('*').eq('resuelta', false).order('created_at', { ascending: false });
        window._activeAlerts = res.data || [];
        
        if (res.error || !res.data || res.data.length === 0) {
            if(pnlBase) pnlBase.style.display = 'none';
            if(pnlAdmin) pnlAdmin.style.display = 'none';
            return;
        }

        var htmlAlertas = '';
        res.data.forEach(function(a) {
            var d = new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            htmlAlertas += '<div style="background: white; padding: 10px 15px; border-radius: 8px; border-left: 5px solid var(--danger); display: flex; justify-content: space-between; align-items: center;">' +
                '<div><strong>' + a.establecimiento + '</strong> (' + d + ')<br><span style="color:var(--text-muted); font-size:0.9rem;">' + a.mensaje + '</span></div>' +
                '<button class="btn btn-secondary btn-small" onclick="window._resolverAlerta(\'' + a.id + '\')">Marcar Resuelta</button>' +
            '</div>';
        });

        if(pnlBase && lstBase) { pnlBase.style.display = 'block'; lstBase.innerHTML = htmlAlertas; }
        if(pnlAdmin && lstAdmin) { pnlAdmin.style.display = 'block'; lstAdmin.innerHTML = htmlAlertas; }
    }

    window._resolverAlerta = async function(id) {
        if(!confirm('¿Seguro que esta emergencia fue resuelta?')) return;
        await supabase.from('alertas').update({ resuelta: true }).eq('id', id);
        fetchAlertasActivas();
    };

    function getSkeletonTableRows(cols) {
        var html = '';
        for (var i = 0; i < 5; i++) {
            html += '<tr class="animate-row" style="animation-delay:' + (i * 50) + 'ms">';
            for(var j=0; j<cols; j++){
                html += '<td><div class="skeleton skeleton-row"></div></td>';
            }
            html += '</tr>';
        }
        return html;
    }

    async function fetchDashboardData() {
        var tbody = document.getElementById('registros-tbody');
        if (tbody) tbody.innerHTML = getSkeletonTableRows(6);
        
        try {
            var res = await supabase.from('votos').select('*, usuarios(username)').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            baseData = res.data || [];
            
            // Search filter
            var searchTerm = document.getElementById('base-search-votos') ? document.getElementById('base-search-votos').value.toLowerCase() : '';
            if (searchTerm) {
                baseFiltered = baseData.filter(function(r) {
                    var text = ('Mesa ' + r.junta_numero + ' ' + (r.establecimiento || '') + ' ' + (r.observaciones || '')).toLowerCase();
                    return text.includes(searchTerm);
                });
            } else {
                baseFiltered = baseData.slice();
            }
            
            basePage = 1; // reset page on new fetch
            updateBaseStats(baseData);
            renderDashboardTable();
            fetchAlertasActivas();
            renderMap('map-base', baseData, window._activeAlerts || []);
        } catch (err) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">Error: ' + err.message + '</td></tr>';
        }
    }

    function updateBaseStats(records) {
        var totalVotos = records.reduce(function(s, r) { return s + (r.cantidad_votos || 0); }, 0);
        animateNumber('total-votos', totalVotos);
        animateNumber('total-mesas', records.length);
        
        // Progress bar
        var progressPercent = Math.min(100, Math.round((records.length / TOTAL_JUNTAS) * 100));
        var pText = document.getElementById('base-progress-text');
        var pFill = document.getElementById('base-progress-fill');
        if (pText && pFill) {
            pText.textContent = records.length + '/' + TOTAL_JUNTAS + ' (' + progressPercent + '%)';
            pFill.style.width = progressPercent + '%';
        }
        renderScoreboard(records);
    }

    // ================================================
    // MARCADOR POR DIGNIDAD
    // ================================================
    var _currentTab = 'alcalde';

    window._switchTab = function(tab) {
        _currentTab = tab;
        var panels = ['alcalde','prefecto','cu','cr'];
        panels.forEach(function(p) {
            var panel = document.getElementById('panel-' + p);
            var btn   = document.getElementById('tab-' + p);
            if (!panel || !btn) return;
            if (p === tab) {
                panel.style.display = 'block';
                btn.style.color = 'var(--primary)';
                btn.style.fontWeight = '700';
                btn.style.borderBottom = '3px solid var(--primary)';
                btn.style.marginBottom = '-2px';
            } else {
                panel.style.display = 'none';
                btn.style.color = 'var(--text-muted)';
                btn.style.fontWeight = '600';
                btn.style.borderBottom = 'none';
                btn.style.marginBottom = '0';
            }
        });
        // Update table headers too
        renderTableHeaders(tab);
        renderDashboardTable();
    };

    function renderTableHeaders(tab) {
        var thead = document.getElementById('base-table-head');
        if (!thead) return;
        var configs = {
            alcalde: [
                { label: 'Fabián (L17-18)', color: '#3b82f6' },
                { label: 'L1 Lucero' }, { label: 'L4 Ponce' }, { label: 'L7 Jácome' },
                { label: 'L63 Castillo' }, { label: 'L105 Proaño' },
                { label: '⚪ Blancos' }, { label: '❌ Nulos' }
            ],
            prefecto: [
                { label: 'L4 Romo' }, { label: 'L7 Poso' }, { label: 'L63 J. Robles' },
                { label: '⚪ Blancos' }, { label: '❌ Nulos' }
            ],
            cu: [
                { label: 'L1' }, { label: 'L4' }, { label: 'L7' },
                { label: 'L17-18', color: '#3b82f6' }, { label: 'L63' }, { label: 'L105' },
                { label: '⚪ Blancos' }, { label: '❌ Nulos' }
            ],
            cr: [
                { label: 'L1' }, { label: 'L4' }, { label: 'L7' },
                { label: 'L17-18', color: '#3b82f6' }, { label: 'L63' }, { label: 'L105' },
                { label: '⚪ Blancos' }, { label: '❌ Nulos' }
            ]
        };
        var cols = configs[tab] || configs.alcalde;
        var colspan = cols.length + 4; // mesa + hora + gps + acta
        thead.innerHTML = '<th>Mesa / Establ.</th>' +
            cols.map(function(c) {
                return '<th' + (c.color ? ' style="color:' + c.color + '; font-weight:900;"' : '') + '>' + c.label + '</th>';
            }).join('') +
            '<th>Hora</th><th>GPS</th><th>Acta</th>';
    }

    function renderScoreboard(records) {
        var alcalde = [
            { label: 'Fabián Robles', sub: 'Lista 17-18', color: '#3b82f6', key: 'cantidad_votos', highlight: true },
            { label: 'Raúl Lucero',    sub: 'Lista 1',     color: '#ef4444', key: 'alc_l1' },
            { label: 'Andrés Ponce',   sub: 'Lista 4',     color: '#f59e0b', key: 'alc_l4' },
            { label: 'Gabriel Jácome', sub: 'Lista 7',     color: '#10b981', key: 'alc_l7' },
            { label: 'Rubén Castillo', sub: 'Lista 63',    color: '#8b5cf6', key: 'alc_l63' },
            { label: 'Javier Proaño', sub: 'Lista 105',   color: '#ec4899', key: 'alc_l105' },
        ];
        var prefecto = [
            { label: 'Edison Romo',  sub: 'Lista 4',  color: '#f59e0b', key: 'pref_l4' },
            { label: 'Lucia Poso',   sub: 'Lista 7',  color: '#10b981', key: 'pref_l7' },
            { label: 'Julio Robles', sub: 'Lista 63', color: '#8b5cf6', key: 'pref_l63' },
        ];
        var concUrb = [
            { label: 'Lista 1',     color: '#ef4444', key: 'cu_l1' },
            { label: 'Lista 4',     color: '#f59e0b', key: 'cu_l4' },
            { label: 'Lista 7',     color: '#10b981', key: 'cu_l7' },
            { label: 'Lista 17-18', color: '#3b82f6', key: 'cu_l1718', highlight: true },
            { label: 'Lista 63',    color: '#8b5cf6', key: 'cu_l63' },
            { label: 'Lista 105',   color: '#ec4899', key: 'cu_l105' },
        ];
        var concRur = [
            { label: 'Lista 1',     color: '#ef4444', key: 'cr_l1' },
            { label: 'Lista 4',     color: '#f59e0b', key: 'cr_l4' },
            { label: 'Lista 7',     color: '#10b981', key: 'cr_l7' },
            { label: 'Lista 17-18', color: '#3b82f6', key: 'cr_l1718', highlight: true },
            { label: 'Lista 63',    color: '#8b5cf6', key: 'cr_l63' },
            { label: 'Lista 105',   color: '#ec4899', key: 'cr_l105' },
        ];

        function buildBar(containerId, candidates) {
            var el = document.getElementById(containerId);
            if (!el) return;
            var totals = candidates.map(function(c) {
                return records.reduce(function(s, r) { return s + (r[c.key] || 0); }, 0);
            });
            var max = Math.max.apply(null, totals) || 1;
            el.innerHTML = '';
            candidates.forEach(function(c, i) {
                var pct = Math.round((totals[i] / max) * 100);
                var border = c.highlight ? '2px solid ' + c.color : '1px solid var(--surface-border)';
                el.innerHTML += `
                <div style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px; border:${border}; background:${c.highlight ? 'rgba(59,130,246,0.06)' : 'transparent'}">
                    <div style="width:110px; font-size:0.8rem; font-weight:${c.highlight ? '800' : '600'}; color:${c.highlight ? c.color : 'var(--text)'}; flex-shrink:0;">
                        ${c.label}${c.sub ? '<br><span style="font-size:0.65rem; color:var(--text-muted); font-weight:400;">' + c.sub + '</span>' : ''}
                    </div>
                    <div style="flex:1; background:var(--surface-border); border-radius:6px; height:12px; overflow:hidden;">
                        <div style="height:100%; width:${pct}%; background:${c.color}; border-radius:6px; transition:width 0.8s cubic-bezier(.4,0,.2,1);"></div>
                    </div>
                    <div style="width:55px; text-align:right; font-size:0.9rem; font-weight:800; color:${c.color}; flex-shrink:0;">${totals[i].toLocaleString()}</div>
                </div>`;
            });
        }

        buildBar('scores-alcalde', alcalde);
        buildBar('scores-prefecto', prefecto);
        buildBar('scores-cu', concUrb);
        buildBar('scores-cr', concRur);
    }

    function renderDashboardTable() {
        var tbody = document.getElementById('registros-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (baseFiltered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:20px; color:var(--text-muted); font-style:italic;">No hay registros encontrados.</td></tr>';
            updatePagination('votos', 1, 1);
            return;
        }

        var totalPages = Math.ceil(baseFiltered.length / PAGE_SIZE);
        if (basePage > totalPages) basePage = totalPages;
        if (basePage < 1) basePage = 1;
        
        var start = (basePage - 1) * PAGE_SIZE;
        var end = start + PAGE_SIZE;
        var pageData = baseFiltered.slice(start, end);

        var tab = _currentTab || 'alcalde';

        pageData.forEach(function(rec, idx) {
            var t = new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var genText = rec.genero === 'Masculino' ? ' (M)' : (rec.genero === 'Femenino' ? ' (F)' : '');

            var mapLink = (rec.latitud && rec.longitud)
                ? '<a href="https://www.google.com/maps/search/?api=1&query=' + rec.latitud + ',' + rec.longitud + '" target="_blank" style="color:var(--primary); font-size:1.2rem;" title="Ver en Mapa">📍</a>'
                : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>';

            var actaBtn = '<button class="btn-view-doc" style="width:100%;" onclick="window._openModal(\'' + rec.evidencia_url + '\')">Ver Acta</button>';

            var mesaCell = '<td><strong>Mesa ' + rec.junta_numero + genText + '</strong><br><span style="color:var(--text-muted);font-size:0.75rem;">' + (rec.establecimiento || '—') + '</span></td>';
            var timeCell = '<td style="color:var(--text-muted);font-size:0.85rem;">' + t + '</td>';

            var dataCells = '';

            if (tab === 'alcalde') {
                var isFabian = true; // highlight main candidate column
                dataCells =
                    '<td style="color:#3b82f6; font-weight:900; font-size:1rem;">' + (rec.cantidad_votos || 0) + '</td>' +
                    '<td>' + (rec.alc_l1 || 0) + '</td>' +
                    '<td>' + (rec.alc_l4 || 0) + '</td>' +
                    '<td>' + (rec.alc_l7 || 0) + '</td>' +
                    '<td>' + (rec.alc_l63 || 0) + '</td>' +
                    '<td>' + (rec.alc_l105 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.votos_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.votos_nulos || 0) + '</td>';
            } else if (tab === 'prefecto') {
                dataCells =
                    '<td>' + (rec.pref_l4 || 0) + '</td>' +
                    '<td>' + (rec.pref_l7 || 0) + '</td>' +
                    '<td>' + (rec.pref_l63 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.pref_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.pref_nulos || 0) + '</td>';
            } else if (tab === 'cu') {
                dataCells =
                    '<td>' + (rec.cu_l1 || 0) + '</td>' +
                    '<td>' + (rec.cu_l4 || 0) + '</td>' +
                    '<td>' + (rec.cu_l7 || 0) + '</td>' +
                    '<td style="color:#3b82f6; font-weight:800;">' + (rec.cu_l1718 || 0) + '</td>' +
                    '<td>' + (rec.cu_l63 || 0) + '</td>' +
                    '<td>' + (rec.cu_l105 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.cu_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.cu_nulos || 0) + '</td>';
            } else if (tab === 'cr') {
                dataCells =
                    '<td>' + (rec.cr_l1 || 0) + '</td>' +
                    '<td>' + (rec.cr_l4 || 0) + '</td>' +
                    '<td>' + (rec.cr_l7 || 0) + '</td>' +
                    '<td style="color:#3b82f6; font-weight:800;">' + (rec.cr_l1718 || 0) + '</td>' +
                    '<td>' + (rec.cr_l63 || 0) + '</td>' +
                    '<td>' + (rec.cr_l105 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.cr_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.cr_nulos || 0) + '</td>';
            }

            var tr = document.createElement('tr');
            tr.className = 'animate-row';
            tr.style.animationDelay = (idx * 50) + 'ms';
            tr.innerHTML = mesaCell + dataCells + timeCell +
                '<td style="text-align:center;">' + mapLink + '</td>' +
                '<td>' + actaBtn + '</td>';
            tbody.appendChild(tr);
        });

        updatePagination('votos', basePage, totalPages);
        updateTicker(baseData);
    }

    // Pagination helper
    function updatePagination(prefix, current, total) {
        var pInfo = document.getElementById(prefix + '-page-info');
        var pPrev = document.getElementById(prefix + '-prev');
        var pNext = document.getElementById(prefix + '-next');
        if (!pInfo || !pPrev || !pNext) return;
        
        pInfo.textContent = 'Página ' + current + ' de ' + total;
        pPrev.disabled = current <= 1;
        pNext.disabled = current >= total;
        
        pPrev.onclick = function() {
            if (prefix === 'votos') { basePage--; renderDashboardTable(); }
            if (prefix === 'users') { usersPage--; renderUsersTable(); }
            if (prefix === 'admin-votos') { adminVotosPage--; renderAdminDashboardTable(); }
        };
        pNext.onclick = function() {
            if (prefix === 'votos') { basePage++; renderDashboardTable(); }
            if (prefix === 'users') { usersPage++; renderUsersTable(); }
            if (prefix === 'admin-votos') { adminVotosPage++; renderAdminDashboardTable(); }
        };
    }

    // Setup base search listener
    var baseSearchInput = document.getElementById('base-search-votos');
    if (baseSearchInput) {
        baseSearchInput.addEventListener('input', function() {
            var term = this.value.toLowerCase();
            baseFiltered = baseData.filter(function(r) {
                var text = ('Mesa ' + r.junta_numero + ' ' + (r.genero || '') + ' ' + (r.establecimiento || '') + ' ' + (r.observaciones || '')).toLowerCase();
                return text.includes(term);
            });
            basePage = 1;
            renderDashboardTable();
        });
    }

    window._exportarExcelAvanzado = async function() {
        if (typeof ExcelJS === 'undefined' || typeof saveAs === 'undefined') {
            showToast('Librerías Excel no cargadas aún.', 'error'); return;
        }
        if (baseFiltered.length === 0) return showToast('No hay datos para exportar', 'error');

        var btn = document.querySelector('button[onclick="window._exportarExcelAvanzado()"]');
        var oldText = btn ? btn.textContent : 'Exportar Excel';
        if(btn) { btn.disabled = true; btn.textContent = 'Generando...'; }

        try {
            var wb = new ExcelJS.Workbook();
            wb.creator = 'App CNE';
            wb.created = new Date();

            // Hoja 1: Resumen
            var ws1 = wb.addWorksheet('Resumen Ejecutivo');
            ws1.columns = [{ width: 25 }, { width: 20 }];
            ws1.getCell('A1').value = 'REPORTE EJECUTIVO DE ESCRUTINIO';
            ws1.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
            ws1.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            ws1.mergeCells('A1:E1');

            var totalVotos = baseFiltered.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
            var totalBlancos = baseFiltered.reduce(function(s, r) { return s + (r.votos_blancos || 0); }, 0);
            var totalNulos = baseFiltered.reduce(function(s, r) { return s + (r.votos_nulos || 0); }, 0);

            ws1.getCell('A3').value = 'Total Votos Fabián:';
            ws1.getCell('B3').value = totalVotos;
            ws1.getCell('B3').font = { bold: true, color: { argb: 'FF3B82F6' }, size: 14 };

            ws1.getCell('A4').value = 'Votos en Blanco:';
            ws1.getCell('B4').value = totalBlancos;

            ws1.getCell('A5').value = 'Votos Nulos:';
            ws1.getCell('B5').value = totalNulos;

            ws1.getCell('A6').value = 'Mesas Reportadas:';
            ws1.getCell('B6').value = baseFiltered.length + ' de ' + TOTAL_JUNTAS;

            // Gráfico
            var canvas = document.getElementById('chart-distribucion');
            if (canvas) {
                var imgData = canvas.toDataURL('image/png');
                var imgId = wb.addImage({ base64: imgData, extension: 'png' });
                ws1.addImage(imgId, {
                    tl: { col: 0, row: 8 },
                    ext: { width: 500, height: 300 }
                });
            }

            // Hoja 2: Datos
            var ws2 = wb.addWorksheet('Datos de Mesas');
            ws2.columns = [
                { header: 'Ingresado Por', key: 'usr', width: 15 },
                { header: 'Junta', key: 'junta', width: 10 },
                { header: 'Género', key: 'gen', width: 15 },
                { header: 'Recinto/Establecimiento', key: 'est', width: 35 },
                { header: 'Votos Fabián (Alc L17-18)', key: 'votos', width: 20 },
                { header: 'Alc L1 Lucero', key: 'alcl1', width: 14 },
                { header: 'Alc L4 Ponce', key: 'alcl4', width: 14 },
                { header: 'Alc L7 Jácome', key: 'alcl7', width: 14 },
                { header: 'Alc L63 Castillo', key: 'alcl63', width: 14 },
                { header: 'Alc L105 Proaño', key: 'alcl105', width: 14 },
                { header: 'Blancos Alc.', key: 'bla', width: 12 },
                { header: 'Nulos Alc.', key: 'nul', width: 12 },
                { header: 'Pref L4 Romo', key: 'prefl4', width: 14 },
                { header: 'Pref L7 Poso', key: 'prefl7', width: 14 },
                { header: 'Pref L63 Robles', key: 'prefl63', width: 14 },
                { header: 'Blancos Pref.', key: 'prefbla', width: 12 },
                { header: 'Nulos Pref.', key: 'prefnul', width: 12 },
                { header: 'CU L1', key: 'cul1', width: 10 },
                { header: 'CU L4', key: 'cul4', width: 10 },
                { header: 'CU L7', key: 'cul7', width: 10 },
                { header: 'CU L17-18', key: 'cul1718', width: 12 },
                { header: 'CU L63', key: 'cul63', width: 10 },
                { header: 'CU L105', key: 'cul105', width: 10 },
                { header: 'Blancos CU', key: 'cubla', width: 12 },
                { header: 'Nulos CU', key: 'cunul', width: 12 },
                { header: 'CR L1', key: 'crl1', width: 10 },
                { header: 'CR L4', key: 'crl4', width: 10 },
                { header: 'CR L7', key: 'crl7', width: 10 },
                { header: 'CR L17-18', key: 'crl1718', width: 12 },
                { header: 'CR L63', key: 'crl63', width: 10 },
                { header: 'CR L105', key: 'crl105', width: 10 },
                { header: 'Blancos CR', key: 'crbla', width: 12 },
                { header: 'Nulos CR', key: 'crnul', width: 12 },
                { header: 'Total Padrón', key: 'pad', width: 15 },
                { header: 'Latitud', key: 'lat', width: 15 },
                { header: 'Longitud', key: 'lon', width: 15 },
                { header: 'Observaciones', key: 'obs', width: 40 },
                { header: 'Fecha', key: 'fecha', width: 20 },
                { header: 'Evidencia', key: 'url', width: 30 }
            ];

            ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
            ws2.autoFilter = 'A1:M1';

            baseFiltered.forEach(function(r) {
                var usrName = (r.usuarios && r.usuarios.username) ? r.usuarios.username : 'Desconocido';
                ws2.addRow({
                    usr: usrName,
                    junta: r.junta_numero,
                    gen: r.genero || '',
                    est: r.establecimiento || '',
                    votos: r.cantidad_votos,
                    alcl1: r.alc_l1 || 0, alcl4: r.alc_l4 || 0, alcl7: r.alc_l7 || 0,
                    alcl63: r.alc_l63 || 0, alcl105: r.alc_l105 || 0,
                    bla: r.votos_blancos || 0,
                    nul: r.votos_nulos || 0,
                    prefl4: r.pref_l4 || 0, prefl7: r.pref_l7 || 0, prefl63: r.pref_l63 || 0,
                    prefbla: r.pref_blancos || 0, prefnul: r.pref_nulos || 0,
                    cul1: r.cu_l1 || 0, cul4: r.cu_l4 || 0, cul7: r.cu_l7 || 0,
                    cul1718: r.cu_l1718 || 0, cul63: r.cu_l63 || 0, cul105: r.cu_l105 || 0,
                    cubla: r.cu_blancos || 0, cunul: r.cu_nulos || 0,
                    crl1: r.cr_l1 || 0, crl4: r.cr_l4 || 0, crl7: r.cr_l7 || 0,
                    crl1718: r.cr_l1718 || 0, crl63: r.cr_l63 || 0, crl105: r.cr_l105 || 0,
                    crbla: r.cr_blancos || 0, crnul: r.cr_nulos || 0,
                    pad: r.total_sufragantes || 0,
                    lat: r.latitud || '', lon: r.longitud || '',
                    obs: r.observaciones || '',
                    fecha: new Date(r.created_at).toLocaleString(),
                    url: r.evidencia_url
                });
            });

            var buffer = await wb.xlsx.writeBuffer();
            var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, 'Reporte_Escrutinio.xlsx');
            showToast('Excel generado exitosamente', 'success');

        } catch (e) {
            console.error('Error ExcelJS:', e);
            showToast('Error al generar Excel: ' + e.message, 'error');
        } finally {
            if(btn) { btn.disabled = false; btn.textContent = oldText; }
        }
    };

    // Ticker Update
    function updateTicker(records) {
        if (!records || records.length === 0) return;
        var tickerHTML = '';
        var recent = records.slice(0, 10);
        recent.forEach(function(r) {
            var estText = r.establecimiento ? ' (' + r.establecimiento + ')' : '';
            var obsIcon = r.observaciones ? ' ⚠️ Novedad' : '';
            var genIcon = r.genero === 'Masculino' ? '♂️ ' : (r.genero === 'Femenino' ? '♀️ ' : '');
            tickerHTML += '<span class="ticker-item">🟢 Mesa ' + r.junta_numero + ' ' + genIcon + estText + ' reporta <strong>' + r.cantidad_votos + ' votos</strong>' + obsIcon + '</span> • ';
        });
        
        var tBase = document.getElementById('base-ticker-content');
        var tAdmin = document.getElementById('admin-ticker-content');
        if (tBase) tBase.innerHTML = tickerHTML;
        if (tAdmin) tAdmin.innerHTML = tickerHTML;
    }

    // Alias for old renderDashboard
    async function renderDashboard() {
        await fetchDashboardData();
    }

    function animateNumber(id, end) {
        var obj = document.getElementById(id);
        if (!obj) return;
        var dur = 1000, ts = null;
        var step = function(t) {
            if (!ts) ts = t;
            var p = Math.min((t - ts) / dur, 1);
            obj.innerHTML = Math.floor((1 - Math.pow(1 - p, 4)) * end);
            if (p < 1) window.requestAnimationFrame(step); else obj.innerHTML = end;
        };
        window.requestAnimationFrame(step);
    }

    window._openModal = function(url) {
        var mb = document.getElementById('modal-body-content');
        mb.innerHTML = '';
        if (url.toLowerCase().includes('.pdf')) {
            var iframe = document.createElement('iframe');
            iframe.src = url; mb.appendChild(iframe);
        } else {
            var img = document.createElement('img');
            img.src = url; img.alt = 'Acta'; mb.appendChild(img);
        }
        document.getElementById('modal-evidencia').classList.add('active');
    };

    window._closeModal = function() {
        document.getElementById('modal-evidencia').classList.remove('active');
        setTimeout(function() { document.getElementById('modal-body-content').innerHTML = ''; }, 300);
    };

    function showToast(msg, type) {
        var t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast show ' + (type || 'success');
        setTimeout(function() { t.className = 'toast'; }, 3000);
    }

    window.app = { logout: logout };

    // ================================================
    // ADMIN DASHBOARD
    // ================================================
    var adminChart = null;
    var distChart = null;
    var globalAdminFilter = null; // para filtrar por recinto

    var adminVotosData = [];
    var adminVotosFiltered = [];
    var adminVotosPage = 1;

    // Tabs Scoreboard Admin
    var _admCurrentTab = 'alcalde';
    window._admSwitchTab = function(tab) {
        _admCurrentTab = tab;
        ['alcalde','prefecto','cu','cr'].forEach(function(p) {
            var panel = document.getElementById('adm-panel-' + p);
            var btn   = document.getElementById('adm-tab-' + p);
            if (!panel || !btn) return;
            if (p === tab) {
                panel.style.display = 'block';
                btn.style.color = 'var(--primary)';
                btn.style.fontWeight = '700';
                btn.style.borderBottom = '3px solid var(--primary)';
                btn.style.marginBottom = '-2px';
            } else {
                panel.style.display = 'none';
                btn.style.color = 'var(--text-muted)';
                btn.style.fontWeight = '600';
                btn.style.borderBottom = 'none';
                btn.style.marginBottom = '0';
            }
        });
    };

    // Tabs Tabla Admin
    var _admTableCurrentTab = 'alcalde';
    window._admTableTab = function(tab) {
        _admTableCurrentTab = tab;
        ['alcalde','prefecto','cu','cr'].forEach(function(p) {
            var btn = document.getElementById('adm-ttab-' + p);
            if (!btn) return;
            if (p === tab) {
                btn.style.background = 'var(--primary)';
                btn.style.color = '#fff';
                btn.style.borderColor = 'var(--primary)';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'var(--text-muted)';
                btn.style.borderColor = 'var(--surface-border)';
            }
        });
        renderAdminTableHeaders(tab);
        renderAdminDashboardTable();
    };

    function renderAdminTableHeaders(tab) {
        var thead = document.getElementById('admin-table-head');
        if (!thead) return;
        var configs = {
            alcalde: [
                { label: 'Fabián (L17-18)', color: '#3b82f6' },
                { label: 'L1 Lucero' }, { label: 'L4 Ponce' }, { label: 'L7 Jácome' },
                { label: 'L63 Cast.' }, { label: 'L105 Proaño' },
                { label: '⚪ Bl.' }, { label: '❌ Nul.' }
            ],
            prefecto: [
                { label: 'L4 Romo' }, { label: 'L7 Poso' }, { label: 'L63 Robles' },
                { label: '⚪ Bl.' }, { label: '❌ Nul.' }
            ],
            cu: [
                { label: 'L1' }, { label: 'L4' }, { label: 'L7' }, { label: 'L17-18', color: '#3b82f6' },
                { label: 'L63' }, { label: 'L105' }, { label: '⚪ Bl.' }, { label: '❌ Nul.' }
            ],
            cr: [
                { label: 'L1' }, { label: 'L4' }, { label: 'L7' }, { label: 'L17-18', color: '#3b82f6' },
                { label: 'L63' }, { label: 'L105' }, { label: '⚪ Bl.' }, { label: '❌ Nul.' }
            ]
        };
        var c = configs[tab] || configs.alcalde;
        var html = '<th>Mesa / Establ.</th>';
        c.forEach(function(col) {
            var st = col.color ? ' style="color:'+col.color+'; font-weight:900;"' : '';
            html += '<th'+st+'>' + col.label + '</th>';
        });
        html += '<th>Padrón</th><th>Hora</th><th>GPS</th><th>Acta</th><th>Usuario</th>';
        thead.innerHTML = html;
    }

    function renderAdminScoreboard(records) {
        var createBars = function(containerId, barsData, maxVal) {
            var container = document.getElementById(containerId);
            if (!container) return;
            var html = '';
            barsData.forEach(function(b) {
                var pct = maxVal > 0 ? (b.val / maxVal) * 100 : 0;
                var color = b.color || '#3b82f6';
                html += '<div style="margin-bottom:6px;">' +
                    '<div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:600; margin-bottom:2px; color:var(--text);">' +
                        '<span>' + b.label + '</span><span>' + b.val.toLocaleString() + '</span>' +
                    '</div>' +
                    '<div style="height:6px; background:var(--surface-border); border-radius:3px; overflow:hidden;">' +
                        '<div style="height:100%; width:' + pct + '%; background:' + color + '; border-radius:3px;"></div>' +
                    '</div>' +
                '</div>';
            });
            container.innerHTML = html;
        };

        var alc_f = records.reduce(function(s,r){return s+(r.cantidad_votos||0);},0);
        var alc_1 = records.reduce(function(s,r){return s+(r.alc_l1||0);},0);
        var alc_4 = records.reduce(function(s,r){return s+(r.alc_l4||0);},0);
        var alc_7 = records.reduce(function(s,r){return s+(r.alc_l7||0);},0);
        var alc_63 = records.reduce(function(s,r){return s+(r.alc_l63||0);},0);
        var alc_105 = records.reduce(function(s,r){return s+(r.alc_l105||0);},0);
        var maxAlc = Math.max(alc_f, alc_1, alc_4, alc_7, alc_63, alc_105) || 1;

        createBars('adm-scores-alcalde', [
            { label:'Fabián (17-18)', val:alc_f, color:'#3b82f6' },
            { label:'Lucero (1)', val:alc_1, color:'#dc2626' },
            { label:'Ponce (4)', val:alc_4, color:'#d97706' },
            { label:'Jácome (7)', val:alc_7, color:'#059669' },
            { label:'Castillo (63)', val:alc_63, color:'#7c3aed' },
            { label:'Proaño (105)', val:alc_105, color:'#db2777' }
        ], maxAlc);

        var pref_4 = records.reduce(function(s,r){return s+(r.pref_l4||0);},0);
        var pref_7 = records.reduce(function(s,r){return s+(r.pref_l7||0);},0);
        var pref_63 = records.reduce(function(s,r){return s+(r.pref_l63||0);},0);
        var maxPref = Math.max(pref_4, pref_7, pref_63) || 1;
        createBars('adm-scores-prefecto', [
            { label:'Romo (4)', val:pref_4, color:'#d97706' },
            { label:'Poso (7)', val:pref_7, color:'#059669' },
            { label:'Robles (63)', val:pref_63, color:'#7c3aed' }
        ], maxPref);

        var cu_1 = records.reduce(function(s,r){return s+(r.cu_l1||0);},0);
        var cu_4 = records.reduce(function(s,r){return s+(r.cu_l4||0);},0);
        var cu_7 = records.reduce(function(s,r){return s+(r.cu_l7||0);},0);
        var cu_17 = records.reduce(function(s,r){return s+(r.cu_l1718||0);},0);
        var cu_63 = records.reduce(function(s,r){return s+(r.cu_l63||0);},0);
        var cu_105 = records.reduce(function(s,r){return s+(r.cu_l105||0);},0);
        var maxCu = Math.max(cu_1, cu_4, cu_7, cu_17, cu_63, cu_105) || 1;
        createBars('adm-scores-cu', [
            { label:'Lista 1', val:cu_1, color:'#dc2626' },
            { label:'Lista 4', val:cu_4, color:'#d97706' },
            { label:'Lista 7', val:cu_7, color:'#059669' },
            { label:'Lista 17-18', val:cu_17, color:'#3b82f6' },
            { label:'Lista 63', val:cu_63, color:'#7c3aed' },
            { label:'Lista 105', val:cu_105, color:'#db2777' }
        ], maxCu);

        var cr_1 = records.reduce(function(s,r){return s+(r.cr_l1||0);},0);
        var cr_4 = records.reduce(function(s,r){return s+(r.cr_l4||0);},0);
        var cr_7 = records.reduce(function(s,r){return s+(r.cr_l7||0);},0);
        var cr_17 = records.reduce(function(s,r){return s+(r.cr_l1718||0);},0);
        var cr_63 = records.reduce(function(s,r){return s+(r.cr_l63||0);},0);
        var cr_105 = records.reduce(function(s,r){return s+(r.cr_l105||0);},0);
        var maxCr = Math.max(cr_1, cr_4, cr_7, cr_17, cr_63, cr_105) || 1;
        createBars('adm-scores-cr', [
            { label:'Lista 1', val:cr_1, color:'#dc2626' },
            { label:'Lista 4', val:cr_4, color:'#d97706' },
            { label:'Lista 7', val:cr_7, color:'#059669' },
            { label:'Lista 17-18', val:cr_17, color:'#3b82f6' },
            { label:'Lista 63', val:cr_63, color:'#7c3aed' },
            { label:'Lista 105', val:cr_105, color:'#db2777' }
        ], maxCr);
    }

    function renderAdminDashboardTable() {
        var tbody = document.getElementById('admin-votos-tbody');
        if (!tbody) return;
        if (adminVotosFiltered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="15" style="text-align:center; color:var(--text-muted); padding:30px;">No hay datos para mostrar</td></tr>';
            return;
        }

        var totalPages = Math.ceil(adminVotosFiltered.length / PAGE_SIZE);
        if (adminVotosPage > totalPages) adminVotosPage = totalPages;
        if (adminVotosPage < 1) adminVotosPage = 1;

        var start = (adminVotosPage - 1) * PAGE_SIZE;
        var pageData = adminVotosFiltered.slice(start, start + PAGE_SIZE);

        tbody.innerHTML = '';
        var tab = _admTableCurrentTab;

        pageData.forEach(function(rec, idx) {
            var d = new Date(rec.created_at);
            var timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var gen = rec.genero === 'Masculino' ? '♂️' : (rec.genero === 'Femenino' ? '♀️' : '');
            var est = rec.establecimiento ? '<br><span style="font-size:0.75rem; color:var(--text-muted);">' + rec.establecimiento + '</span>' : '';
            var userStr = rec.usuarios && rec.usuarios.username ? rec.usuarios.username : '—';
            
            var mesaCell = '<td><div style="font-weight:700;">Mesa ' + rec.junta_numero + ' ' + gen + '</div>' + est + '</td>';
            var timeCell = '<td>' + (rec.total_sufragantes || 0) + '</td><td>' + timeStr + '</td>';
            var mapLink = rec.latitud && rec.longitud ? '<a href="https://www.google.com/maps?q=' + rec.latitud + ',' + rec.longitud + '" target="_blank" style="text-decoration:none;" title="Ver en Mapa">📍</a>' : '—';
            var actaBtn = rec.evidencia_url ? '<button class="btn btn-secondary btn-small" onclick="window._openModal(\'' + rec.evidencia_url + '\')" style="padding:4px 8px; font-size:0.75rem;">Ver</button>' : '—';

            var dataCells = '';
            if (tab === 'alcalde') {
                dataCells =
                    '<td style="color:#3b82f6; font-weight:800;">' + (rec.cantidad_votos || 0) + '</td>' +
                    '<td>' + (rec.alc_l1 || 0) + '</td>' +
                    '<td>' + (rec.alc_l4 || 0) + '</td>' +
                    '<td>' + (rec.alc_l7 || 0) + '</td>' +
                    '<td>' + (rec.alc_l63 || 0) + '</td>' +
                    '<td>' + (rec.alc_l105 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.votos_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.votos_nulos || 0) + '</td>';
            } else if (tab === 'prefecto') {
                dataCells =
                    '<td>' + (rec.pref_l4 || 0) + '</td>' +
                    '<td>' + (rec.pref_l7 || 0) + '</td>' +
                    '<td>' + (rec.pref_l63 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.pref_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.pref_nulos || 0) + '</td>';
            } else if (tab === 'cu') {
                dataCells =
                    '<td>' + (rec.cu_l1 || 0) + '</td>' +
                    '<td>' + (rec.cu_l4 || 0) + '</td>' +
                    '<td>' + (rec.cu_l7 || 0) + '</td>' +
                    '<td style="color:#3b82f6; font-weight:800;">' + (rec.cu_l1718 || 0) + '</td>' +
                    '<td>' + (rec.cu_l63 || 0) + '</td>' +
                    '<td>' + (rec.cu_l105 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.cu_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.cu_nulos || 0) + '</td>';
            } else if (tab === 'cr') {
                dataCells =
                    '<td>' + (rec.cr_l1 || 0) + '</td>' +
                    '<td>' + (rec.cr_l4 || 0) + '</td>' +
                    '<td>' + (rec.cr_l7 || 0) + '</td>' +
                    '<td style="color:#3b82f6; font-weight:800;">' + (rec.cr_l1718 || 0) + '</td>' +
                    '<td>' + (rec.cr_l63 || 0) + '</td>' +
                    '<td>' + (rec.cr_l105 || 0) + '</td>' +
                    '<td style="color:var(--text-muted);">' + (rec.cr_blancos || 0) + '</td>' +
                    '<td style="color:var(--danger);">' + (rec.cr_nulos || 0) + '</td>';
            }

            var tr = document.createElement('tr');
            tr.className = 'animate-row';
            tr.style.animationDelay = (idx * 50) + 'ms';
            tr.innerHTML = mesaCell + dataCells + timeCell +
                '<td style="text-align:center;">' + mapLink + '</td>' +
                '<td>' + actaBtn + '</td>' +
                '<td>' + userStr + '</td>';
            tbody.appendChild(tr);
        });

        updatePagination('admin-votos', adminVotosPage, totalPages);
    }

    // Listener de búsqueda admin
    document.addEventListener('DOMContentLoaded', function() {
        var adminSearch = document.getElementById('admin-search-votos');
        if (adminSearch) {
            adminSearch.addEventListener('input', function() {
                var term = this.value.toLowerCase();
                adminVotosFiltered = adminVotosData.filter(function(r) {
                    var uName = (r.usuarios && r.usuarios.username) ? r.usuarios.username : '';
                    var text = ('Mesa ' + r.junta_numero + ' ' + (r.genero || '') + ' ' + (r.establecimiento || '') + ' ' + (r.observaciones || '') + ' ' + uName).toLowerCase();
                    return text.includes(term);
                });
                adminVotosPage = 1;
                renderAdminDashboardTable();
            });
        }
    });

    window._clearFilter = function() {
        globalAdminFilter = null;
        document.getElementById('btn-clear-filter').style.display = 'none';
        renderAdminDashboard();
    };

    window._setFilter = function(est) {
        globalAdminFilter = est;
        document.getElementById('btn-clear-filter').style.display = 'inline-block';
        renderAdminDashboard();
    };

    async function fetchAdminData() {
        var usersTbody = document.getElementById('users-tbody');
        if (usersTbody) usersTbody.innerHTML = getSkeletonTableRows(3);
        
        try {
            var [votosRes, usersRes] = await Promise.all([
                supabase.from('votos').select('*, usuarios(username)').order('created_at', { ascending: false }),
                supabase.from('usuarios').select('*').order('created_at', { ascending: false })
            ]);

            // Stats
            if (!votosRes.error) {
                var dataToRender = votosRes.data;
                if (globalAdminFilter) {
                    dataToRender = dataToRender.filter(function(r) { return r.establecimiento === globalAdminFilter; });
                }

                var totalVotos = dataToRender.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
                document.getElementById('admin-total-votos').textContent = totalVotos.toLocaleString();
                document.getElementById('admin-total-mesas').textContent = dataToRender.length;
                
                var totalBlancos = dataToRender.reduce(function(s, r) { return s + (r.votos_blancos || 0); }, 0);
                var totalNulos = dataToRender.reduce(function(s, r) { return s + (r.votos_nulos || 0); }, 0);
                var pendientes = Math.max(0, TOTAL_JUNTAS - dataToRender.length);

                document.getElementById('admin-total-blancos').textContent = totalBlancos.toLocaleString();
                document.getElementById('admin-total-nulos').textContent = totalNulos.toLocaleString();
                document.getElementById('admin-pendientes').textContent = pendientes;
                
                // Progress
                var progressPercent = Math.min(100, Math.round((dataToRender.length / TOTAL_JUNTAS) * 100));
                var pText = document.getElementById('admin-progress-text');
                var pFill = document.getElementById('admin-progress-fill');
                if (pText && pFill) {
                    pText.textContent = dataToRender.length + '/' + TOTAL_JUNTAS + ' (' + progressPercent + '%)';
                    pFill.style.width = progressPercent + '%';
                }

                // Table setup
                adminVotosData = votosRes.data;
                var searchTerm = document.getElementById('admin-search-votos') ? document.getElementById('admin-search-votos').value.toLowerCase() : '';
                if (searchTerm) {
                    adminVotosFiltered = adminVotosData.filter(function(r) {
                        var uName = (r.usuarios && r.usuarios.username) ? r.usuarios.username : '';
                        var text = ('Mesa ' + r.junta_numero + ' ' + (r.genero || '') + ' ' + (r.establecimiento || '') + ' ' + (r.observaciones || '') + ' ' + uName).toLowerCase();
                        return text.includes(searchTerm);
                    });
                } else {
                    adminVotosFiltered = adminVotosData.slice();
                }
                
                renderAdminScoreboard(dataToRender);
                renderAdminDashboardTable();

                var chartData = dataToRender.slice().sort(function(a,b){ return a.junta_numero - b.junta_numero; });
                renderAdminChart(chartData);
                renderDistChart(dataToRender);
                renderTrendChart(votosRes.data);
                
                // El ranking siempre usa todos los datos para no desaparecer
                renderRanking(votosRes.data);
                updateTicker(votosRes.data);
                fetchAlertasActivas();
                renderMap('map-admin', votosRes.data, window._activeAlerts || []);
            }

            if (!usersRes.error) {
                document.getElementById('admin-total-usuarios').textContent = usersRes.data.length;
                usersData = usersRes.data;
                
                var searchTerm = document.getElementById('admin-search-users') ? document.getElementById('admin-search-users').value.toLowerCase() : '';
                if (searchTerm) {
                    usersFiltered = usersData.filter(function(u) {
                        var text = (u.username + ' ' + u.role).toLowerCase();
                        return text.includes(searchTerm);
                    });
                } else {
                    usersFiltered = usersData.slice();
                }
                
                usersPage = 1;
                renderUsersTable();
            }
        } catch(e) {
            console.error('Error cargando admin dashboard:', e);
        }
    }

    async function renderAdminDashboard() {
        await fetchAdminData();
    }

    function renderAdminChart(records) {
        var canvas = document.getElementById('chart-votos');
        var emptyMsg = document.getElementById('chart-empty');

        if (records.length === 0) {
            if(canvas) canvas.style.display = 'none';
            if(emptyMsg) emptyMsg.style.display = 'block';
            return;
        }

        if(canvas) canvas.style.display = 'block';
        if(emptyMsg) emptyMsg.style.display = 'none';

        var labels = records.map(function(r) {
            return r.establecimiento ? r.establecimiento + ' (M' + r.junta_numero + ')' : 'Mesa ' + r.junta_numero;
        });
        var data = records.map(function(r) { return r.cantidad_votos; });

        if (adminChart) adminChart.destroy();

        if (canvas) {
            var ctx = canvas.getContext('2d');
            var gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)'); // blue
            gradient.addColorStop(1, 'rgba(14, 165, 233, 0.4)'); // cyan fade
            
            adminChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Votos',
                        data: data,
                        backgroundColor: gradient,
                        borderColor: 'rgba(37, 99, 235, 1)',
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) { return ' ' + ctx.parsed.y + ' votos'; }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: {
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }

    function renderUsersTable() {
        var tbody = document.getElementById('users-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (usersFiltered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:20px; font-style:italic;">No hay usuarios.</td></tr>';
            updatePagination('users', 1, 1);
            return;
        }

        var totalPages = Math.ceil(usersFiltered.length / PAGE_SIZE);
        if (usersPage > totalPages) usersPage = totalPages;
        if (usersPage < 1) usersPage = 1;
        
        var start = (usersPage - 1) * PAGE_SIZE;
        var end = start + PAGE_SIZE;
        var pageData = usersFiltered.slice(start, end);

        pageData.forEach(function(u, idx) {
            var roleLabels = { admin: 'Admin', mesa: 'Mesa Receptora', base: 'Equipo Base' };
            var tr = document.createElement('tr');
            tr.className = 'animate-row';
            tr.style.animationDelay = (idx * 50) + 'ms';
            var deleteBtn = u.role !== 'admin'
                ? '<button class="btn-delete" onclick="window._deleteUser(\'' + u.id + '\', \'' + u.username + '\')">Eliminar</button>'
                : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>';

            tr.innerHTML =
                '<td><strong>' + u.username + '</strong></td>' +
                '<td><span class="role-badge ' + u.role + '">' + (roleLabels[u.role] || u.role) + '</span></td>' +
                '<td>' + deleteBtn + '</td>';
            tbody.appendChild(tr);
        });

        updatePagination('users', usersPage, totalPages);
    }

    function renderDistChart(data) {
        var canvas = document.getElementById('chart-distribucion');
        if (!canvas) return;
        if (distChart) distChart.destroy();

        // Alcalde totales por candidato
        var totalFabian  = data.reduce(function(s, r) { return s + (r.cantidad_votos || 0); }, 0);
        var totalL1      = data.reduce(function(s, r) { return s + (r.alc_l1 || 0); }, 0);
        var totalL4      = data.reduce(function(s, r) { return s + (r.alc_l4 || 0); }, 0);
        var totalL7      = data.reduce(function(s, r) { return s + (r.alc_l7 || 0); }, 0);
        var totalL63     = data.reduce(function(s, r) { return s + (r.alc_l63 || 0); }, 0);
        var totalL105    = data.reduce(function(s, r) { return s + (r.alc_l105 || 0); }, 0);
        var totalBlancos = data.reduce(function(s, r) { return s + (r.votos_blancos || 0); }, 0);
        var totalNulos   = data.reduce(function(s, r) { return s + (r.votos_nulos || 0); }, 0);

        var ctx = canvas.getContext('2d');
        distChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [
                    'Fabián Robles (L17-18)',
                    'Raúl Lucero (L1)',
                    'Andrés Ponce (L4)',
                    'Gabriel Jácome (L7)',
                    'Rubén Castillo (L63)',
                    'Javier Proaño (L105)',
                    'Blancos', 'Nulos'
                ],
                datasets: [{
                    data: [totalFabian, totalL1, totalL4, totalL7, totalL63, totalL105, totalBlancos, totalNulos],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.9)',
                        'rgba(239, 68, 68, 0.85)',
                        'rgba(245, 158, 11, 0.85)',
                        'rgba(16, 185, 129, 0.85)',
                        'rgba(139, 92, 246, 0.85)',
                        'rgba(236, 72, 153, 0.85)',
                        'rgba(200, 200, 200, 0.7)',
                        'rgba(107, 114, 128, 0.7)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: document.body.classList.contains('dark-mode') ? '#e4e4e7' : '#3f3f46', font: { size: 10 } } }
                }
            }
        });
    }

    // Top 5 Ranking
    function renderRanking(records) {
        var rankingList = document.getElementById('ranking-list');
        if (!rankingList) return;
        
        // agrupar por establecimiento
        var groups = {};
        records.forEach(function(r) {
            var est = r.establecimiento || 'Desconocido';
            if (!groups[est]) groups[est] = 0;
            groups[est] += r.cantidad_votos;
        });

        var arr = Object.keys(groups).map(function(k) { return { nombre: k, votos: groups[k] }; });
        arr.sort(function(a, b) { return b.votos - a.votos; });
        var top5 = arr.slice(0, 5);

        rankingList.innerHTML = '';
        if (top5.length === 0) {
            rankingList.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">Sin datos</p>';
            return;
        }

        var medals = ['🥇', '🥈', '🥉'];
        top5.forEach(function(item, i) {
            var icon = i < 3 ? medals[i] : '🏅';
            var highlight = globalAdminFilter === item.nombre ? 'background: var(--surface-border); border-color: var(--primary);' : '';
            var html = '<div class="ranking-item animate-row" style="cursor:pointer; ' + highlight + ' animation-delay:' + (i*100) + 'ms" onclick="window._setFilter(\'' + item.nombre + '\')">' +
                '<div class="ranking-info">' +
                    '<strong>' + icon + ' ' + item.nombre + '</strong>' +
                '</div>' +
                '<div class="ranking-votos">' + item.votos + '</div>' +
            '</div>';
            rankingList.innerHTML += html;
        });
    }



    // Setup Admin Search Listener
    var adminSearchInput = document.getElementById('admin-search-users');
    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', function() {
            var term = this.value.toLowerCase();
            usersFiltered = usersData.filter(function(u) {
                var text = (u.username + ' ' + u.role).toLowerCase();
                return text.includes(term);
            });
            usersPage = 1;
            renderUsersTable();
        });
    }

    window._exportUsersExcel = async function() {
        if (typeof ExcelJS === 'undefined' || typeof saveAs === 'undefined') {
            showToast('Librerías Excel no cargadas', 'error'); return;
        }
        if (usersFiltered.length === 0) return showToast('No hay usuarios', 'error');
        try {
            var wb = new ExcelJS.Workbook();
            var ws = wb.addWorksheet('Usuarios');
            ws.columns = [
                { header: 'Usuario', key: 'usr', width: 20 },
                { header: 'Rol', key: 'rol', width: 20 },
                { header: 'Fecha Creación', key: 'fecha', width: 20 }
            ];
            ws.getRow(1).font = { bold: true };
            usersFiltered.forEach(function(u) {
                ws.addRow({ usr: u.username, rol: u.role, fecha: new Date(u.created_at).toLocaleString() });
            });
            var buffer = await wb.xlsx.writeBuffer();
            var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, 'Usuarios_CNE.xlsx');
        } catch(e) {
            showToast('Error Excel: ' + e.message, 'error');
        }
    };

    async function deleteUser(userId, username) {
        if (!confirm('¿Estás seguro de que quieres eliminar al usuario "' + username + '"?')) return;

        try {
            var res = await supabase.from('usuarios').delete().eq('id', userId);
            if (res.error) throw res.error;
            showToast('Usuario "' + username + '" eliminado');
            fetchAdminData(); // Refresh
        } catch(e) {
            showToast('Error al eliminar: ' + e.message, 'error');
        }
    }

    window._deleteUser = deleteUser;
    window._reloadUsers = fetchAdminData;

    window._clearData = async function() {
        if (!confirm('¿Estás seguro de que quieres eliminar TODOS los datos (votos, actas, alertas, chat)? Los usuarios NO se borrarán. Esta acción no se puede deshacer.')) return;
        
        try {
            await supabase.from('mensajes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('alertas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            await supabase.from('asistencias').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            var res = await supabase.from('votos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            
            if (res.error) throw res.error;
            
            showToast('Datos limpiados correctamente', 'success');
            
            // Recargar datos
            fetchAdminData();
        } catch (e) {
            showToast('Error al limpiar datos: ' + e.message, 'error');
            console.error(e);
        }
    };

    // ================================================
    // EXPORTAR A CSV
    // ================================================
    function exportToCSV(filename, rows) {
        var processRow = function (row) {
            var finalVal = '';
            for (var j = 0; j < row.length; j++) {
                var innerValue = row[j] === null ? '' : row[j].toString();
                if (row[j] instanceof Date) {
                    innerValue = row[j].toLocaleString();
                }
                var result = innerValue.replace(/"/g, '""');
                if (result.search(/("|,|\n)/g) >= 0)
                    result = '"' + result + '"';
                if (j > 0)
                    finalVal += ',';
                finalVal += result;
            }
            return finalVal + '\n';
        };

        var csvFile = '';
        for (var i = 0; i < rows.length; i++) {
            csvFile += processRow(rows[i]);
        }

        var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement("a");
        if (link.download !== undefined) { // feature detection
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // ================================================
    // REPORTE PDF — Generado con jsPDF
    // ================================================
    window._exportPDF = async function() {
        if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
            showToast('Librería jsPDF no cargada. Recarga la página.', 'error');
            return;
        }

        var btn = document.getElementById('btn-export-pdf');
        btn.disabled = true;
        btn.textContent = 'Generando...';

        try {
            // Obtener datos frescos
            var res = await supabase.from('votos').select('*, usuarios(username)').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            var data = res.data || [];

            var JsPDF = window.jspdf ? window.jspdf.jsPDF : jsPDF;
            var doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            var pageW = 210;
            var margin = 14;
            var y = 0;

            // ── ENCABEZADO ──────────────────────────────────────────────
            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageW, 38, 'F');

            doc.setFillColor(37, 99, 235);
            doc.rect(0, 36, pageW, 3, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(96, 165, 250);
            doc.text('INFORME EJECUTIVO DE ESCRUTINIO', pageW / 2, 14, { align: 'center' });

            doc.setFontSize(10);
            doc.setTextColor(148, 163, 184);
            doc.text('Campaña Fabián Robles  •  Lista 17-18', pageW / 2, 22, { align: 'center' });

            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            var now = new Date().toLocaleString('es-EC', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
            doc.text('Generado: ' + now, pageW / 2, 30, { align: 'center' });

            y = 48;

            // ── KPIs ────────────────────────────────────────────────────
            var totalFabian  = data.reduce(function(s,r){ return s+(r.cantidad_votos||0);},0);
            var totalBlancos = data.reduce(function(s,r){ return s+(r.votos_blancos||0);},0);
            var totalNulos   = data.reduce(function(s,r){ return s+(r.votos_nulos||0);},0);
            var mesasRep     = data.length;
            var pct          = TOTAL_JUNTAS > 0 ? Math.round((mesasRep/TOTAL_JUNTAS)*100) : 0;

            var kpis = [
                { label: 'Votos Fabián', value: totalFabian.toLocaleString(), color: [37,99,235] },
                { label: 'Mesas Reportadas', value: mesasRep + '/' + TOTAL_JUNTAS + ' (' + pct + '%)', color: [5,150,105] },
                { label: 'Votos Blancos', value: totalBlancos.toLocaleString(), color: [107,114,128] },
                { label: 'Votos Nulos', value: totalNulos.toLocaleString(), color: [220,38,38] },
            ];

            var kpiW = (pageW - margin*2 - 9) / 4;
            kpis.forEach(function(k, i) {
                var x = margin + i * (kpiW + 3);
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(k.color[0], k.color[1], k.color[2]);
                doc.setLineWidth(0.5);
                doc.roundedRect(x, y, kpiW, 20, 2, 2, 'FD');

                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(k.color[0], k.color[1], k.color[2]);
                doc.text(k.value, x + kpiW/2, y + 10, { align: 'center' });

                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                doc.text(k.label.toUpperCase(), x + kpiW/2, y + 16, { align: 'center' });
            });

            y += 28;

            // ── ALCALDE — MARCADOR ──────────────────────────────────────
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(30, 58, 138);
            doc.text('🏛  RESULTADOS ALCALDE', margin, y);
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(0.4);
            doc.line(margin, y+2, pageW-margin, y+2);
            y += 7;

            var alcalde = [
                { label: 'Fabián Robles',   sub:'Lista 17-18', key:'cantidad_votos', color:[37,99,235] },
                { label: 'Raúl Lucero',     sub:'Lista 1',     key:'alc_l1',         color:[220,38,38] },
                { label: 'Andrés Ponce',    sub:'Lista 4',     key:'alc_l4',         color:[217,119,6] },
                { label: 'Gabriel Jácome',  sub:'Lista 7',     key:'alc_l7',         color:[5,150,105] },
                { label: 'Rubén Castillo',  sub:'Lista 63',    key:'alc_l63',        color:[124,58,237] },
                { label: 'Javier Proaño',   sub:'Lista 105',   key:'alc_l105',       color:[219,39,119] },
            ];

            var alcTotals = alcalde.map(function(c){ return data.reduce(function(s,r){return s+(r[c.key]||0);},0); });
            var alcMax = Math.max.apply(null, alcTotals) || 1;
            var barMaxW = pageW - margin*2 - 50;

            alcalde.forEach(function(c, i) {
                var val = alcTotals[i];
                var barW = (val / alcMax) * barMaxW;
                var pctAlc = alcMax > 0 ? Math.round((val/alcTotals[0])*100) : 0; // vs Fabián

                // Barra fondo
                doc.setFillColor(241, 245, 249);
                doc.roundedRect(margin + 48, y, barMaxW, 6, 1, 1, 'F');
                // Barra valor
                if (barW > 0) {
                    doc.setFillColor(c.color[0], c.color[1], c.color[2]);
                    doc.roundedRect(margin + 48, y, barW, 6, 1, 1, 'F');
                }
                // Nombre
                doc.setFont('helvetica', i===0 ? 'bold' : 'normal');
                doc.setFontSize(8);
                doc.setTextColor(30,41,59);
                doc.text(c.label + ' (' + c.sub + ')', margin, y + 4.5);
                // Número
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(c.color[0], c.color[1], c.color[2]);
                doc.text(val.toLocaleString(), pageW - margin, y + 4.5, { align: 'right' });

                y += 9;
            });

            // Blancos/Nulos alcalde
            var alcBla = data.reduce(function(s,r){return s+(r.votos_blancos||0);},0);
            var alcNul = data.reduce(function(s,r){return s+(r.votos_nulos||0);},0);
            doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(107,114,128);
            doc.text('Blancos: ' + alcBla + '   Nulos: ' + alcNul, margin, y + 2);
            y += 10;

            // ── PREFECTO ────────────────────────────────────────────────
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(109, 40, 217);
            doc.text('👑  RESULTADOS PREFECTO', margin, y);
            doc.setDrawColor(124, 58, 237);
            doc.setLineWidth(0.4);
            doc.line(margin, y+2, pageW-margin, y+2);
            y += 7;

            var prefecto = [
                { label:'Edison Romo',  sub:'Lista 4',  key:'pref_l4',  color:[217,119,6] },
                { label:'Lucia Poso',   sub:'Lista 7',  key:'pref_l7',  color:[5,150,105] },
                { label:'Julio Robles', sub:'Lista 63', key:'pref_l63', color:[124,58,237] },
            ];
            var prefTotals = prefecto.map(function(c){ return data.reduce(function(s,r){return s+(r[c.key]||0);},0); });
            var prefMax = Math.max.apply(null, prefTotals) || 1;

            prefecto.forEach(function(c, i) {
                var val = prefTotals[i];
                var barW2 = (val / prefMax) * barMaxW;
                doc.setFillColor(241,245,249);
                doc.roundedRect(margin+48, y, barMaxW, 6, 1,1,'F');
                if (barW2 > 0) { doc.setFillColor(c.color[0],c.color[1],c.color[2]); doc.roundedRect(margin+48, y, barW2, 6, 1,1,'F'); }
                doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(30,41,59);
                doc.text(c.label + ' (' + c.sub + ')', margin, y+4.5);
                doc.setFont('helvetica','bold'); doc.setTextColor(c.color[0],c.color[1],c.color[2]);
                doc.text(val.toLocaleString(), pageW-margin, y+4.5, { align:'right' });
                y += 9;
            });
            var prefBla = data.reduce(function(s,r){return s+(r.pref_blancos||0);},0);
            var prefNul = data.reduce(function(s,r){return s+(r.pref_nulos||0);},0);
            doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(107,114,128);
            doc.text('Blancos: ' + prefBla + '   Nulos: ' + prefNul, margin, y+2);
            y += 12;

            // ── TABLA MESAS ─────────────────────────────────────────────
            doc.addPage();
            y = 20;

            doc.setFillColor(15,23,42);
            doc.rect(0, 0, pageW, 14, 'F');
            doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(96,165,250);
            doc.text('DETALLE POR MESA RECEPTORA', pageW/2, 9, { align:'center' });

            // Cabecera tabla
            var cols = ['Mesa','Género','Establecimiento','Fabián (L17-18)','L1','L4','L7','L63','L105','Blancos','Nulos'];
            var colW  = [14,    14,      58,               22,               10,  10,  10,  10,   10,   14,      12];
            var colX  = [];
            var cx = margin;
            colW.forEach(function(w){ colX.push(cx); cx += w; });

            doc.setFillColor(37,99,235);
            doc.rect(margin, y, pageW - margin*2, 7, 'F');
            doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(255,255,255);
            cols.forEach(function(h, i){ doc.text(h, colX[i]+1, y+4.5); });
            y += 7;

            // Filas
            data.forEach(function(r, idx) {
                if (y > 270) { doc.addPage(); y = 20; }
                if (idx % 2 === 0) { doc.setFillColor(248,250,252); doc.rect(margin, y, pageW-margin*2, 6, 'F'); }
                doc.setFont('helvetica', idx===0?'bold':'normal'); doc.setFontSize(6.5); doc.setTextColor(30,41,59);

                var gen = r.genero === 'Masculino' ? 'M' : (r.genero === 'Femenino' ? 'F' : '');
                var est = (r.establecimiento||'—').substring(0,28);
                var rowData = [
                    'Mesa ' + (r.junta_numero||''),
                    gen,
                    est,
                    (r.cantidad_votos||0).toString(),
                    (r.alc_l1||0).toString(),
                    (r.alc_l4||0).toString(),
                    (r.alc_l7||0).toString(),
                    (r.alc_l63||0).toString(),
                    (r.alc_l105||0).toString(),
                    (r.votos_blancos||0).toString(),
                    (r.votos_nulos||0).toString()
                ];

                rowData.forEach(function(cell, i) {
                    if (i === 3) { doc.setTextColor(37,99,235); doc.setFont('helvetica','bold'); }
                    else { doc.setTextColor(30,41,59); doc.setFont('helvetica','normal'); }
                    doc.text(cell, colX[i]+1, y+4);
                });

                doc.setDrawColor(226,232,240);
                doc.setLineWidth(0.1);
                doc.line(margin, y+6, pageW-margin, y+6);
                y += 6;
            });

            // ── PIE DE PÁGINA ───────────────────────────────────────────
            var totalPgs = doc.getNumberOfPages();
            for (var pg = 1; pg <= totalPgs; pg++) {
                doc.setPage(pg);
                doc.setFillColor(15,23,42);
                doc.rect(0, 288, pageW, 10, 'F');
                doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(100,116,139);
                doc.text('Campaña Fabián Robles — Sistema CNE  |  Documento confidencial de uso interno', margin, 294);
                doc.text('Pág. ' + pg + ' / ' + totalPgs, pageW-margin, 294, { align:'right' });
            }

            doc.save('Informe_Escrutinio_' + new Date().toLocaleDateString('es-EC').replace(/\//g,'-') + '.pdf');
            showToast('✅ Informe PDF generado exitosamente', 'success');

        } catch(err) {
            console.error('PDF error:', err);
            showToast('Error al generar PDF: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '📄 PDF';
        }
    };

    // ================================================
    // MODO OSCURO
    // ================================================
    function initDarkMode() {
        var btn = document.getElementById('btn-dark-mode');
        if (!btn) return;
        var isDark = localStorage.getItem('theme') === 'dark';
        if (isDark) document.body.classList.add('dark-mode');
        
        btn.addEventListener('click', function() {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'light');
            }
        });
    }

    // ================================================
    // MODO TV (WAR ROOM)
    // ================================================
    window._isTVMode = false;
    var tvDistChart = null;

    // ================================================
    // MAPA TÁCTICO (LEAFLET)
    // ================================================
    var maps = {};
    var mapMarkers = {};

    function renderMap(mapId, records, alerts) {
        if (!document.getElementById(mapId)) return;
        if (typeof L === 'undefined') return;

        if (!maps[mapId]) {
            maps[mapId] = L.map(mapId).setView([-1.8312, -78.1834], 6);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(maps[mapId]);
            mapMarkers[mapId] = L.layerGroup().addTo(maps[mapId]);
        }

        var layer = mapMarkers[mapId];
        layer.clearLayers();
        var bounds = [];

        records.forEach(function(r) {
            if (r.latitud && r.longitud) {
                var m = L.circleMarker([r.latitud, r.longitud], {
                    radius: 6, fillColor: '#22c55e', color: '#16a34a', weight: 2, opacity: 1, fillOpacity: 0.8
                });
                m.bindPopup('<strong>Mesa ' + (r.junta_numero||'') + '</strong><br>' + (r.establecimiento||''));
                layer.addLayer(m);
                bounds.push([r.latitud, r.longitud]);
            }
        });

        if (alerts) {
            var sosIcon = L.divIcon({ className: 'sos-marker-flash', html: '🚨', iconSize: [24, 24] });
            alerts.forEach(function(a) {
                if (a.latitud && a.longitud) {
                    var m = L.marker([a.latitud, a.longitud], { icon: sosIcon });
                    m.bindPopup('<strong style="color:red;">🚨 SOS ALERTA</strong><br>' + (a.establecimiento||'') + '<br>' + a.mensaje);
                    layer.addLayer(m);
                    bounds.push([a.latitud, a.longitud]);
                } else {
                    var rec = records.find(function(rx) { return rx.establecimiento === a.establecimiento && rx.latitud; });
                    if (rec) {
                        var m2 = L.marker([rec.latitud, rec.longitud], { icon: sosIcon });
                        m2.bindPopup('<strong style="color:red;">🚨 SOS ALERTA</strong><br>' + (a.establecimiento||'') + '<br>' + a.mensaje);
                        layer.addLayer(m2);
                        bounds.push([rec.latitud, rec.longitud]);
                    }
                }
            });
        }

        if (bounds.length > 0) maps[mapId].fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
    }

    // ================================================
    // GRÁFICO DE TENDENCIA (LÍNEAS)
    // ================================================
    var trendChart = null;
    function renderTrendChart(records) {
        var canvas = document.getElementById('chart-tendencia');
        if (!canvas) return;
        if (typeof Chart === 'undefined') return;

        if (trendChart) trendChart.destroy();

        var buckets = {};
        records.forEach(function(r) {
            var d = new Date(r.created_at);
            var coeff = 1000 * 60 * 15;
            var rounded = new Date(Math.round(d.getTime() / coeff) * coeff);
            var timeKey = rounded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (!buckets[timeKey]) buckets[timeKey] = 0;
            buckets[timeKey] += r.cantidad_votos;
        });

        var labels = Object.keys(buckets).sort();
        var data = labels.map(function(k) { return buckets[k]; });

        var acum = [];
        var sum = 0;
        data.forEach(function(val) { sum += val; acum.push(sum); });

        var ctx = canvas.getContext('2d');
        var isDark = document.body.classList.contains('dark-mode');
        
        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Votos Acumulados',
                    data: acum,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#fff'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: isDark ? '#e4e4e7' : '#3f3f46' } },
                    y: { ticks: { color: isDark ? '#e4e4e7' : '#3f3f46' } }
                }
            }
        });
    }



    window._openTVMode = function() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(function(e){});
        }
        document.querySelectorAll('.view').forEach(function(el) { el.classList.remove('active'); });
        document.getElementById('view-tv').style.display = 'flex';
        window._isTVMode = true;
        // Iniciar reloj
        window._tvClockInterval = setInterval(function() {
            var clock = document.getElementById('tv-clock');
            if (clock) clock.textContent = new Date().toLocaleString('es-EC', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
        }, 1000);
        window._refreshTV();
    };

    window._closeTVMode = function() {
        if (document.fullscreenElement) document.exitFullscreen();
        window._isTVMode = false;
        document.getElementById('view-tv').style.display = 'none';
        if (window._tvClockInterval) clearInterval(window._tvClockInterval);
        if (currentUser && currentUser.role) {
            navigate(currentUser.role);
        } else {
            navigate('auth');
        }
    };

    window._refreshTV = async function() {
        if (!window._isTVMode) return;
        var res = await supabase.from('votos').select('*, usuarios(username)').order('created_at', { ascending: false });
        if (res.error) return;
        var data = res.data;

        var totalVotos = data.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
        var totalBlancos = data.reduce(function(s, r) { return s + (r.votos_blancos || 0); }, 0);
        var totalNulos = data.reduce(function(s, r) { return s + (r.votos_nulos || 0); }, 0);
        var totalSospecha = data.filter(function(r) {
            if (!r.total_sufragantes || r.total_sufragantes <= 0) return false;
            var sum = r.cantidad_votos + (r.votos_blancos||0) + (r.votos_nulos||0);
            return sum !== r.total_sufragantes || (r.votos_nulos||0) > r.total_sufragantes * 0.15;
        }).length;
        
        // KPIs en header
        document.getElementById('tv-votos-total').textContent = totalVotos.toLocaleString();

        document.getElementById('tv-mesas-total').textContent = data.length;
        var blanEl = document.getElementById('tv-blancos-total');
        var nulEl = document.getElementById('tv-nulos-total');
        var sosEl = document.getElementById('tv-sospecha-total');
        if (blanEl) blanEl.textContent = totalBlancos.toLocaleString();
        if (nulEl) nulEl.textContent = totalNulos.toLocaleString();
        if (sosEl) sosEl.textContent = totalSospecha;
        
        var progressPercent = Math.min(100, Math.round((data.length / TOTAL_JUNTAS) * 100));
        document.getElementById('tv-progress-fill').style.width = progressPercent + '%';
        document.getElementById('tv-progress-text').textContent = progressPercent + '% Escrutado';

        // Ticker update on TV Mode
        updateTicker(data);
        var tTV = document.getElementById('tv-ticker-content');
        if (tTV) {
            var tickerHTML = '';
            var recent = data.slice(0, 15);
            recent.forEach(function(r) {
                var user = r.usuarios ? r.usuarios.username : 'Veedor';
                tickerHTML += '<span class="ticker-item" style="color:#22c55e;">🟢 Mesa ' + r.junta_numero + ' (' + (r.establecimiento||'') + ') — ' + r.cantidad_votos + ' votos — enviado por: ' + user + '</span> &nbsp;•&nbsp; ';
            });
            tTV.innerHTML = tickerHTML;
        }

        // Feed de Actividad Reciente en TV
        var feed = document.getElementById('tv-activity-feed');
        if (feed) {
            var feedHTML = '';
            data.slice(0, 15).forEach(function(r) {
                var user = r.usuarios ? r.usuarios.username : 'Veedor';
                var hora = new Date(r.created_at).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                var totalCalc = r.cantidad_votos + (r.votos_blancos || 0) + (r.votos_nulos || 0);
                var isSospecha = r.total_sufragantes && r.total_sufragantes > 0 && (totalCalc !== r.total_sufragantes || (r.votos_nulos || 0) > r.total_sufragantes * 0.15);
                var badgeColor = isSospecha ? '#ef4444' : '#22c55e';
                var badgeText = isSospecha ? '⚠️ REVISAR' : '✓ OK';
                feedHTML += `<div style="background:rgba(255,255,255,0.04); border:1px solid ${isSospecha ? '#7f1d1d' : 'rgba(255,255,255,0.08)'}; border-left:3px solid ${badgeColor}; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-shrink:0;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.85rem; font-weight:bold; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Mesa ${r.junta_numero} ${r.genero ? '('+r.genero.charAt(0)+')' : ''} <span style="background:${badgeColor}; color:#fff; padding:1px 5px; border-radius:3px; font-size:0.6rem; font-weight:bold; margin-left:4px;">${badgeText}</span></div>
                        <div style="font-size:0.7rem; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${r.establecimiento || 'Sin recinto'}</div>
                        <div style="font-size:0.7rem; color:#64748b;">👤 ${user} &nbsp;•&nbsp; 🕐 ${hora}</div>
                    </div>
                    <div style="text-align:right; flex-shrink:0;">
                        <div style="font-size:1.2rem; font-weight:bold; color:#3b82f6; line-height:1;">${r.cantidad_votos}</div>
                        <div style="font-size:0.6rem; color:#475569; margin-top:2px;">B:${r.votos_blancos||0} N:${r.votos_nulos||0}</div>
                    </div>
                </div>`;
            });
            feed.innerHTML = feedHTML || '<div style="text-align:center; color:#334155; padding:30px; font-size:0.85rem;">Esperando actas...</div>';
        }

        // Top Mesas
        var topMesas = document.getElementById('tv-top-mesas');
        if (topMesas) {
            var sorted = data.slice().sort(function(a, b) { return b.cantidad_votos - a.cantidad_votos; });
            var topHTML = '';
            sorted.slice(0, 20).forEach(function(r, i) {
                var user = r.usuarios ? r.usuarios.username : '?';
                var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1) + '.';
                topHTML += `<div style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); flex-shrink:0;">
                    <span style="font-size:0.85rem; min-width:22px; text-align:center;">${medal}</span>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:0.78rem; font-weight:bold; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Mesa ${r.junta_numero} ${r.genero ? '('+r.genero.charAt(0)+')' : ''}</div>
                        <div style="font-size:0.65rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.establecimiento || ''} &bull; ${user}</div>
                    </div>
                    <div style="font-size:0.95rem; font-weight:bold; color:#3b82f6; flex-shrink:0;">${r.cantidad_votos}</div>
                </div>`;
            });
            topMesas.innerHTML = topHTML || '<div style="text-align:center; color:#334155; padding:20px; font-size:0.8rem;">Sin datos aún...</div>';
        }

        // Alertas SOS
        var alertasFeed = document.getElementById('tv-alertas-feed');
        if (alertasFeed) {
            var resAlertas = await supabase.from('alertas').select('*, usuarios(username)').eq('resuelta', false).order('created_at', { ascending: false });
            var alertas = resAlertas.data || [];
            var labelHTML = '<div style="font-size:0.6rem; color:#f87171; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; font-weight:700;">🚨 ALERTAS SOS (' + alertas.length + ')</div>';
            if (alertas.length === 0) {
                alertasFeed.innerHTML = labelHTML + '<div style="text-align:center; color:#334155; font-size:0.75rem; padding:8px;">Sin alertas activas ✓</div>';
            } else {
                var aHTML = labelHTML;
                alertas.forEach(function(a) {
                    var user = a.usuarios ? a.usuarios.username : 'Desconocido';
                    var h = new Date(a.created_at).toLocaleTimeString('es-EC', { hour:'2-digit', minute:'2-digit' });
                    aHTML += `<div style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:6px; padding:6px 8px; margin-bottom:4px;">
                        <div style="font-size:0.75rem; font-weight:bold; color:#f87171;">🚨 ${a.establecimiento}</div>
                        <div style="font-size:0.65rem; color:#fca5a5; margin-bottom:2px;">${a.mensaje}</div>
                        <div style="font-size:0.65rem; color:#9ca3af;">👤 ${user} &bull; ${h}</div>
                    </div>`;
                });
                alertasFeed.innerHTML = aHTML;
            }
        }

        // TV Distribución Chart — todos los candidatos de Alcalde
        var canvas = document.getElementById('chart-tv-distribucion');
        if (canvas) {
            if (tvDistChart) tvDistChart.destroy();
            var tvTotalL1   = data.reduce(function(s, r) { return s + (r.alc_l1 || 0); }, 0);
            var tvTotalL4   = data.reduce(function(s, r) { return s + (r.alc_l4 || 0); }, 0);
            var tvTotalL7   = data.reduce(function(s, r) { return s + (r.alc_l7 || 0); }, 0);
            var tvTotalL63  = data.reduce(function(s, r) { return s + (r.alc_l63 || 0); }, 0);
            var tvTotalL105 = data.reduce(function(s, r) { return s + (r.alc_l105 || 0); }, 0);
            var tvTotalBlancos = data.reduce(function(s, r) { return s + (r.votos_blancos || 0); }, 0);
            var tvTotalNulos   = data.reduce(function(s, r) { return s + (r.votos_nulos || 0); }, 0);
            var ctx = canvas.getContext('2d');
            tvDistChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [
                        'Fabián (L17-18)',
                        'Lucero (L1)',
                        'Ponce (L4)',
                        'Jácome (L7)',
                        'Castillo (L63)',
                        'Proaño (L105)',
                        'Blancos', 'Nulos'
                    ],
                    datasets: [{
                        data: [totalVotos, tvTotalL1, tvTotalL4, tvTotalL7, tvTotalL63, tvTotalL105, tvTotalBlancos, tvTotalNulos],
                        backgroundColor: ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#71717a','#374151'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#ffffff', font: { size: 16, weight: 'bold' }, padding: 16 } }
                    }
                }
            });
        }
    };

    // ================================================
    // CHAT INTERNO (WAR ROOM)
    // ================================================
    window._toggleChat = function() {
        var panel = document.getElementById('chat-panel');
        var fab = document.getElementById('chat-fab');
        panel.classList.toggle('active');
        if (panel.classList.contains('active')) {
            fab.classList.remove('has-unread');
            var msgs = document.getElementById('chat-messages');
            msgs.scrollTop = msgs.scrollHeight;
        }
    };

    async function fetchChatMessages() {
        if (!currentUser) return;
        var res = await supabase.from('mensajes').select('*, usuarios(username)').order('created_at', { ascending: true }).limit(50);
        if (res.error) return console.error('Error chat:', res.error);
        var container = document.getElementById('chat-messages');
        container.innerHTML = '';
        res.data.forEach(appendChatMessage);
        container.scrollTop = container.scrollHeight;
    }

    window._appendChatMessage = appendChatMessage;
    function appendChatMessage(msg) {
        var container = document.getElementById('chat-messages');
        var isMine = currentUser && msg.user_id === currentUser.id;
        var div = document.createElement('div');
        div.className = 'chat-msg ' + (isMine ? 'mine' : 'others');
        
        var userHtml = isMine ? '' : '<div class="chat-msg-user">' + (msg.usuarios ? msg.usuarios.username : 'Usuario') + '</div>';
        div.innerHTML = userHtml + '<div>' + msg.mensaje + '</div>';
        
        container.appendChild(div);
        
        if (container.scrollHeight - container.scrollTop < container.clientHeight + 100) {
            container.scrollTop = container.scrollHeight;
        }
    }

    window._sendChatMessage = async function() {
        if (!currentUser) return;
        var input = document.getElementById('chat-input');
        var text = input.value.trim();
        if (!text) return;
        
        input.value = '';
        try {
            var res = await supabase.from('mensajes').insert([{
                user_id: currentUser.id,
                mensaje: text
            }]);
            if (res.error) throw res.error;
        } catch(e) {
            showToast('Error enviando mensaje: ' + e.message, 'error');
            input.value = text;
        }
    };

    // ================================================
    // PWA OFFLINE SYNC
    // ================================================
    function base64ToFile(b64, filename) {
        var arr = b64.split(','), mime = arr[0].match(/:(.*?);/)[1];
        var bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){ u8arr[n] = bstr.charCodeAt(n); }
        return new File([u8arr], filename, {type:mime});
    }

    window.addEventListener('online', async function() {
        showToast('📶 Conexión restaurada. Sincronizando datos pendientes...', 'success');
        var queue = JSON.parse(localStorage.getItem('offlineVotesQueue') || '[]');
        if (queue.length === 0) return;

        var failedQueue = [];
        for (var i = 0; i < queue.length; i++) {
            var q = queue[i];
            try {
                var file = base64ToFile(q.evidencia_b64, q.fileName || 'evidencia_offline.jpg');
                var publicUrl = await uploadFile(file);
                
                var payload = Object.assign({}, q);
                delete payload.evidencia_b64;
                delete payload.fileName;
                payload.evidencia_url = publicUrl;

                var res = await supabase.from('votos').insert([payload]);
                if (res.error) throw res.error;
            } catch(e) {
                console.error('Error sync offline:', e);
                failedQueue.push(q);
            }
        }
        localStorage.setItem('offlineVotesQueue', JSON.stringify(failedQueue));
        if(failedQueue.length === 0) showToast('✅ Todos los votos offline han sido sincronizados.');
        else showToast('⚠️ Algunos votos no se pudieron subir. Se reintentará.', 'error');
    });

    // ================================================
    // VINCULAR EVENTOS
    // ================================================
    var btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', function(e) {
            e.preventDefault();
            login();
        });
    }
    var cuForm = document.getElementById('form-create-user');
    if (cuForm) cuForm.addEventListener('submit', adminCreateUser);
    var mForm = document.getElementById('form-mesa');
    if (mForm) mForm.addEventListener('submit', submitVote);
    var fInput = document.getElementById('evidencia-archivo');
    if (fInput) {
        fInput.addEventListener('change', function(e) {
            var fn = document.getElementById('file-name');
            var fw = document.querySelector('.file-upload-wrapper');
            if (e.target.files.length > 0) { fn.textContent = e.target.files[0].name; fw.classList.add('has-file'); }
            else { fn.textContent = 'Toca aquí para seleccionar un archivo'; fw.classList.remove('has-file'); }
        });
    }

    // ================================================
    // ARRASTRAR BOTÓN MODO OSCURO
    // ================================================
    var darkModeBtn = document.getElementById('btn-dark-mode');
    if (darkModeBtn) {
        var isDragging = false;
        var hasMoved = false;
        var startX, startY, initialX, initialY;

        function dragStart(e) {
            isDragging = true;
            hasMoved = false;
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            var clientY = e.touches ? e.touches[0].clientY : e.clientY;
            startX = clientX;
            startY = clientY;
            initialX = darkModeBtn.offsetLeft;
            initialY = darkModeBtn.offsetTop;
            darkModeBtn.style.transition = 'none';
        }

        function dragMove(e) {
            if (!isDragging) return;
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            var clientY = e.touches ? e.touches[0].clientY : e.clientY;
            var dx = clientX - startX;
            var dy = clientY - startY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;
            if (hasMoved && e.cancelable) e.preventDefault(); // Prevent scrolling
            darkModeBtn.style.left = (initialX + dx) + 'px';
            darkModeBtn.style.top = (initialY + dy) + 'px';
            darkModeBtn.style.right = 'auto';
            darkModeBtn.style.bottom = 'auto';
        }

        function dragEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            darkModeBtn.style.transition = '';
        }

        darkModeBtn.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove, {passive: false});
        document.addEventListener('mouseup', dragEnd);

        darkModeBtn.addEventListener('touchstart', dragStart, {passive: false});
        document.addEventListener('touchmove', dragMove, {passive: false});
        document.addEventListener('touchend', dragEnd);

        // Interceptar click original para no disparar toggle si se arrastró
        darkModeBtn.addEventListener('click', function(e) {
            if (hasMoved) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);
    }

    // ================================================
    // GENERADOR LEGAL DE IMPUGNACIÓN (PDF)
    // ================================================
    window._generateImpugnacion = function(b64Data) {
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            return showToast('El generador de PDF aún está cargando. Intenta de nuevo.', 'error');
        }
        var rec = JSON.parse(decodeURIComponent(atob(b64Data)));
        var d = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });
        
        showToast('Generando PDF Legal...', 'success');

        var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        var pageW = doc.internal.pageSize.getWidth();
        var margin = 20;
        var contentW = pageW - margin * 2;
        var y = 20;

        // ---- ENCABEZADO ----
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('CONSEJO NACIONAL ELECTORAL', pageW / 2, y, { align: 'center' });
        y += 8;
        doc.setFontSize(12);
        doc.text('JUNTA PROVINCIAL ELECTORAL', pageW / 2, y, { align: 'center' });
        y += 7;
        doc.setFontSize(11);
        // Subrayado manual
        var titleText = 'FORMULARIO DE IMPUGNACI\u00d3N DE ESCRUTINIO';
        var titleW = doc.getTextWidth(titleText);
        doc.text(titleText, pageW / 2, y, { align: 'center' });
        doc.setLineWidth(0.3);
        doc.line(pageW / 2 - titleW / 2, y + 1, pageW / 2 + titleW / 2, y + 1);
        y += 15;

        // ---- FECHA ----
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text('Quito, ' + d, pageW - margin, y, { align: 'right' });
        y += 12;

        // ---- CUERPO ----
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        var intro = 'Se\u00f1ores Vocales de la Junta Provincial Electoral:';
        doc.text(intro, margin, y);
        y += 10;

        var parrafo1 = 'Yo, en mi calidad de Delegado/Procurador de la campa\u00f1a pol\u00edtica de Fabi\u00e1n Robles,' +
            ' comparezco ante ustedes y presento formal IMPUGNACI\u00d3N Y RECLAMACI\u00d3N NUM\u00c9RICA a' +
            ' los resultados del escrutinio de la Mesa Receptora del Voto N\u00b0 ' + rec.junta_numero +
            ' ' + (rec.genero || '') + ', ubicada en el recinto electoral ' + (rec.establecimiento || 'No especificado') + '.';
        var parrafo1Lines = doc.splitTextToSize(parrafo1, contentW);
        doc.text(parrafo1Lines, margin, y);
        y += parrafo1Lines.length * 6 + 8;

        // ---- FUNDAMENTOS ----
        doc.setFont('helvetica', 'bold');
        doc.text('FUNDAMENTOS DE HECHO:', margin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        var parrafo2 = 'Durante el proceso de escrutinio, nuestro sistema de control electoral detect\u00f3 inconsistencias' +
            ' matem\u00e1ticas severas que vician de nulidad el acta levantada. Los datos reportados son:';
        var parrafo2Lines = doc.splitTextToSize(parrafo2, contentW);
        doc.text(parrafo2Lines, margin, y);
        y += parrafo2Lines.length * 6 + 8;

        // ---- TABLA DE DATOS ----
        var colW1 = contentW * 0.65;
        var colW2 = contentW * 0.35;
        var rowH = 9;
        var tableData = [
            ['Total Sufragantes (Padr\u00f3n):', String(rec.total_sufragantes || 'N/A')],
            ['Votos V\u00e1lidos (F. Robles):', String(rec.cantidad_votos)],
            ['Votos Blancos:', String(rec.votos_blancos || 0)],
            ['Votos Nulos:', String(rec.votos_nulos || 0)]
        ];
        tableData.forEach(function(row, i) {
            doc.setFillColor(i % 2 === 0 ? 245 : 255, i % 2 === 0 ? 245 : 255, i % 2 === 0 ? 245 : 255);
            doc.rect(margin, y, colW1, rowH, 'FD');
            doc.rect(margin + colW1, y, colW2, rowH, 'FD');
            doc.setFont('helvetica', 'normal');
            doc.text(row[0], margin + 2, y + 6);
            doc.setFont('helvetica', 'bold');
            doc.text(row[1], margin + colW1 + 2, y + 6);
            y += rowH;
        });
        y += 10;

        // ---- CONCLUSIÓN ----
        doc.setFont('helvetica', 'normal');
        var parrafo3 = 'Estas irregularidades contravienen lo estipulado en el C\u00f3digo de la Democracia, ya sea por' +
            ' inconsistencia num\u00e9rica (la suma no cuadra con los sufragantes) o porcentaje an\u00f3malo de nulos/blancos.' +
            ' Por lo cual solicitamos la apertura de urnas y recuento voto a voto de la mencionada junta.' +
            ' Adjuntamos evidencia fotogr\u00e1fica del acta adulterada como anexo a este documento.';
        var parrafo3Lines = doc.splitTextToSize(parrafo3, contentW);
        doc.text(parrafo3Lines, margin, y);
        y += parrafo3Lines.length * 6 + 25;

        // ---- FIRMA ----
        var firmaX = pageW / 2;
        doc.setLineWidth(0.5);
        doc.line(firmaX - 35, y, firmaX + 35, y);
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('FIRMA DEL DELEGADO POL\u00cdTICO', firmaX, y, { align: 'center' });
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.text('Campa\u00f1a Fabi\u00e1n Robles', firmaX, y, { align: 'center' });

        // ---- GUARDAR ----
        doc.save('Impugnacion_Mesa_' + rec.junta_numero + '.pdf');
    };


    initDarkMode();

    console.log('App lista. Vista:', currentView);
});
