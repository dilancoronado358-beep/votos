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

    // Activar Realtime siempre (para cualquier rol logueado)
    setupRealtime();

    // ================================================
    // LOGIN
    // ================================================
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
                user_id: currentUser.id
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
        var totalVotos = records.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
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
    }

    function renderDashboardTable() {
        var tbody = document.getElementById('registros-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (baseFiltered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted); font-style:italic;">No hay registros encontrados.</td></tr>';
            updatePagination('votos', 1, 1);
            return;
        }

        var totalPages = Math.ceil(baseFiltered.length / PAGE_SIZE);
        if (basePage > totalPages) basePage = totalPages;
        if (basePage < 1) basePage = 1;
        
        var start = (basePage - 1) * PAGE_SIZE;
        var end = start + PAGE_SIZE;
        var pageData = baseFiltered.slice(start, end);

        pageData.forEach(function(rec, idx) {
            var t = new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var obsText = rec.observaciones ? '<span style="color:var(--danger); font-size:0.8rem;" title="' + rec.observaciones + '">⚠️ ' + rec.observaciones + '</span>' : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>';
            var genText = rec.genero === 'Masculino' ? ' (M)' : (rec.genero === 'Femenino' ? ' (F)' : '');
            
            var mapLink = (rec.latitud && rec.longitud) 
                ? '<a href="https://www.google.com/maps/search/?api=1&query=' + rec.latitud + ',' + rec.longitud + '" target="_blank" style="color:var(--primary); text-decoration:none; font-size:1.2rem;" title="Ver en Mapa">📍</a>'
                : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>';

            var tr = document.createElement('tr');
            tr.className = 'animate-row';
            tr.style.animationDelay = (idx * 50) + 'ms';
            tr.innerHTML = '<td><strong>Mesa ' + rec.junta_numero + genText + '</strong><br><span style="color:var(--text-muted);font-size:0.8rem;">' + (rec.establecimiento || '—') + '</span></td>' +
                '<td style="color:var(--success);font-weight:bold;">' + rec.cantidad_votos + '</td>' +
                '<td style="color:var(--text-muted);font-size:0.85rem;">' + t + '</td>' +
                '<td>' + obsText + '</td>' +
                '<td style="text-align:center;">' + mapLink + '</td>' +
                '<td><button class="btn-view-doc" onclick="window._openModal(\'' + rec.evidencia_url + '\')">Ver Acta</button></td>';
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
        };
        pNext.onclick = function() {
            if (prefix === 'votos') { basePage++; renderDashboardTable(); }
            if (prefix === 'users') { usersPage++; renderUsersTable(); }
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
                { header: 'Votos Fabián', key: 'votos', width: 15 },
                { header: 'Blancos', key: 'bla', width: 10 },
                { header: 'Nulos', key: 'nul', width: 10 },
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
                    bla: r.votos_blancos || 0,
                    nul: r.votos_nulos || 0,
                    pad: r.total_sufragantes || 0,
                    lat: r.latitud || '',
                    lon: r.longitud || '',
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
                
                // Progress
                var progressPercent = Math.min(100, Math.round((dataToRender.length / TOTAL_JUNTAS) * 100));
                var pText = document.getElementById('admin-progress-text');
                var pFill = document.getElementById('admin-progress-fill');
                if (pText && pFill) {
                    pText.textContent = dataToRender.length + '/' + TOTAL_JUNTAS + ' (' + progressPercent + '%)';
                    pFill.style.width = progressPercent + '%';
                }

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

        var totalFabian = data.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
        var totalBlancos = data.reduce(function(s, r) { return s + (r.votos_blancos || 0); }, 0);
        var totalNulos = data.reduce(function(s, r) { return s + (r.votos_nulos || 0); }, 0);

        var ctx = canvas.getContext('2d');
        distChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Fabián Robles', 'Blancos', 'Nulos'],
                datasets: [{
                    data: [totalFabian, totalBlancos, totalNulos],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.9)', // Blue
                        'rgba(200, 200, 200, 0.8)', // Gray
                        'rgba(239, 68, 68, 0.8)'    // Red
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: document.body.classList.contains('dark-mode') ? '#e4e4e7' : '#3f3f46' } }
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
    // REPORTE PDF
    // ================================================
    window._exportPDF = function() {
        if (typeof html2pdf === 'undefined') {
            showToast('Librería PDF no cargada aún. Intente de nuevo.', 'error');
            return;
        }
        var btn = document.getElementById('btn-export-pdf');
        btn.disabled = true;
        btn.textContent = 'Generando...';

        var element = document.getElementById('view-admin');
        
        // Configuración para el PDF
        var opt = {
            margin:       0.5,
            filename:     'Informe_Ejecutivo_Votos.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        };

        // Generar PDF
        html2pdf().set(opt).from(element).save().then(function() {
            btn.disabled = false;
            btn.textContent = '📄 PDF';
            showToast('PDF generado exitosamente', 'success');
        });
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
        window._refreshTV();
    };

    window._closeTVMode = function() {
        if (document.fullscreenElement) document.exitFullscreen();
        window._isTVMode = false;
        document.getElementById('view-tv').style.display = 'none';
        if (currentUser && currentUser.role) {
            navigate(currentUser.role);
        } else {
            navigate('auth');
        }
    };

    window._refreshTV = async function() {
        if (!window._isTVMode) return;
        var res = await supabase.from('votos').select('*').order('created_at', { ascending: false });
        if (res.error) return;
        var data = res.data;

        var totalVotos = data.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
        document.getElementById('tv-votos-total').textContent = totalVotos.toLocaleString();
        document.getElementById('tv-mesas-total').textContent = data.length;
        
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
                tickerHTML += '<span class="ticker-item" style="color:#22c55e;">🟢 Mesa ' + r.junta_numero + ' (' + (r.establecimiento||'') + ') = ' + r.cantidad_votos + ' votos</span> • ';
            });
            tTV.innerHTML = tickerHTML;
        }

        // TV Distribución Chart
        var canvas = document.getElementById('chart-tv-distribucion');
        if (canvas) {
            if (tvDistChart) tvDistChart.destroy();
            var totalBlancos = data.reduce(function(s, r) { return s + (r.votos_blancos || 0); }, 0);
            var totalNulos = data.reduce(function(s, r) { return s + (r.votos_nulos || 0); }, 0);
            var ctx = canvas.getContext('2d');
            tvDistChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Fabián Robles', 'Blancos', 'Nulos'],
                    datasets: [{
                        data: [totalVotos, totalBlancos, totalNulos],
                        backgroundColor: ['#3b82f6', '#71717a', '#ef4444'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#ffffff', font: { size: 24, weight: 'bold' }, padding: 30 } }
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

    initDarkMode();

    console.log('App lista. Vista:', currentView);
});
