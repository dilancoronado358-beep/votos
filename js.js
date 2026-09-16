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
        var oldView = document.getElementById('view-' + currentView);
        if (oldView) oldView.classList.remove('active');
        currentView = viewId;
        var newView = document.getElementById('view-' + currentView);
        if (newView) {
            newView.classList.add('active');
        } else {
            console.error('Vista no encontrada: view-' + viewId);
            return;
        }
        if (viewId === 'auth') {
            document.body.classList.add('is-login-screen');
        } else {
            document.body.classList.remove('is-login-screen');
        }
        if (viewId === 'base') renderDashboard();
        if (viewId === 'admin') renderAdminDashboard();
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
            }, function() {
                // Si el usuario está en base, recargar dashboard
                if (currentView === 'base') {
                    renderDashboard();
                }
                // Si el admin está viendo el panel, recargar también
                if (currentView === 'admin') {
                    renderAdminDashboard();
                }
            })
            .subscribe(function(status) {
                console.log('Realtime votos:', status);
            });
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
                throw new Error('Error Supabase: ' + result.error.message);
            }
            if (!result.data) {
                throw new Error('Usuario o contraseña incorrectos');
            }

            currentUser = result.data;
            localStorage.setItem('appUser', JSON.stringify(result.data));
            showToast('¡Bienvenido, ' + result.data.username + '!');
            document.getElementById('form-login').reset();
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
                        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    }, 'image/jpeg', 0.8); // 80% calidad
                };
                img.src = e.target.result;
            };
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
    // ENVIAR VOTO
    // ================================================
    async function submitVote(e) {
        e.preventDefault();
        var establecimiento = document.getElementById('establecimiento-mesa').value.trim();
        var junta = document.getElementById('numero-junta').value;
        var votos = document.getElementById('cantidad-votos').value;
        var observaciones = document.getElementById('observaciones').value.trim();
        var fileInput = document.getElementById('evidencia-archivo');
        var btnSubmit = e.target.querySelector('button[type="submit"]');

        if (!fileInput.files.length) { showToast('Debes adjuntar la evidencia del acta.', 'error'); return; }
        if (!currentUser) { showToast('Tu sesión ha expirado', 'error'); logout(); return; }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Verificando...';

        try {
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
            var publicUrl = await uploadFile(fileInput.files[0]);
            
            var payload = {
                establecimiento: establecimiento,
                junta_numero: parseInt(junta),
                cantidad_votos: parseInt(votos),
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
    async function fetchDashboardData() {
        var tbody = document.getElementById('registros-tbody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando datos...</td></tr>';
        try {
            var res = await supabase.from('votos').select('*').order('created_at', { ascending: false });
            if (res.error) throw res.error;
            baseData = res.data;
            
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
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">Error: ' + err.message + '</td></tr>';
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

        pageData.forEach(function(rec) {
            var t = new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            var obsText = rec.observaciones ? '<span style="color:var(--danger); font-size:0.8rem;" title="' + rec.observaciones + '">⚠️ ' + rec.observaciones + '</span>' : '<span style="color:var(--text-muted); font-size:0.8rem;">—</span>';
            var tr = document.createElement('tr');
            tr.innerHTML = '<td><strong>Mesa ' + rec.junta_numero + '</strong><br><span style="color:var(--text-muted);font-size:0.8rem;">' + (rec.establecimiento || '—') + '</span></td>' +
                '<td style="color:var(--success);font-weight:bold;">' + rec.cantidad_votos + '</td>' +
                '<td style="color:var(--text-muted);font-size:0.85rem;">' + t + '</td>' +
                '<td>' + obsText + '</td>' +
                '<td><button class="btn-view-doc" onclick="window._openModal(\'' + rec.evidencia_url + '\')">Ver Acta</button></td>';
            tbody.appendChild(tr);
        });

        updatePagination('votos', basePage, totalPages);
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
                var text = ('Mesa ' + r.junta_numero + ' ' + (r.establecimiento || '') + ' ' + (r.observaciones || '')).toLowerCase();
                return text.includes(term);
            });
            basePage = 1;
            renderDashboardTable();
        });
    }

    window._exportVotosCSV = function() {
        if (baseFiltered.length === 0) return showToast('No hay datos para exportar', 'error');
        var headers = ['Junta', 'Establecimiento', 'Votos', 'Observaciones', 'Fecha/Hora', 'Link Evidencia'];
        var rows = [headers];
        baseFiltered.forEach(function(r) {
            rows.push([
                r.junta_numero,
                r.establecimiento || '',
                r.cantidad_votos,
                r.observaciones || '',
                new Date(r.created_at).toLocaleString(),
                r.evidencia_url
            ]);
        });
        exportToCSV('votos_reporte.csv', rows);
    };

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

    async function fetchAdminData() {
        var tbody = document.getElementById('users-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Cargando...</td></tr>';
        
        try {
            var [votosRes, usersRes] = await Promise.all([
                supabase.from('votos').select('*').order('junta_numero'),
                supabase.from('usuarios').select('*').order('username')
            ]);

            // Stats
            if (!votosRes.error) {
                var totalVotos = votosRes.data.reduce(function(s, r) { return s + r.cantidad_votos; }, 0);
                document.getElementById('admin-total-votos').textContent = totalVotos.toLocaleString();
                document.getElementById('admin-total-mesas').textContent = votosRes.data.length;
                
                // Progress
                var progressPercent = Math.min(100, Math.round((votosRes.data.length / TOTAL_JUNTAS) * 100));
                var pText = document.getElementById('admin-progress-text');
                var pFill = document.getElementById('admin-progress-fill');
                if (pText && pFill) {
                    pText.textContent = votosRes.data.length + '/' + TOTAL_JUNTAS + ' (' + progressPercent + '%)';
                    pFill.style.width = progressPercent + '%';
                }

                renderAdminChart(votosRes.data);
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
            adminChart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Votos',
                        data: data,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: 'rgba(37, 99, 235, 1)',
                        borderWidth: 1,
                        borderRadius: 4,
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

        pageData.forEach(function(u) {
            var roleLabels = { admin: 'Admin', mesa: 'Mesa Receptora', base: 'Equipo Base' };
            var tr = document.createElement('tr');
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

    window._exportUsersCSV = function() {
        if (usersFiltered.length === 0) return showToast('No hay datos para exportar', 'error');
        var headers = ['Username', 'Rol', 'Fecha Creación'];
        var rows = [headers];
        usersFiltered.forEach(function(u) {
            rows.push([
                u.username,
                u.role,
                new Date(u.created_at).toLocaleString()
            ]);
        });
        exportToCSV('usuarios_sistema.csv', rows);
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

    initDarkMode();

    console.log('App lista. Vista:', currentView);
});
