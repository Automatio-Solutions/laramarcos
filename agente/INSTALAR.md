# LaraMarcos OCR — instalación en el servidor

Agente que lee las facturas de las carpetas `GASTOS` / `INGRESOS` de los clientes,
las envía a la app (`crm.laramarcosasesores.es`) y deja el Excel de Aplifisa en la
carpeta del trimestre. Se instala como **servicio de Windows**.

**Qué hace:** lee facturas · crea `AÑO xxxx\Nº TRIMESTRE\GASTOS|INGRESOS` dentro de la
carpeta CONTABILIDAD de cada cliente (sea 06, 07…) · escribe el Excel del trimestre.
**Qué no hace nunca:** mover, cambiar ni borrar facturas u otros documentos.
**Red:** solo conexiones de salida HTTPS (443) a `crm.laramarcosasesores.es`. Ningún puerto abierto.

Requisitos: Windows Server 2019 x64 · usuario de servicio `automatiosrv` con lectura en
`D:\DocumentacionLM` y escritura/creación de carpetas dentro de las carpetas CONTABILIDAD
· unos 200 MB libres.

---

## 1. Copiar el programa

1. Copiar la carpeta `LaraMarcosOCR` a `C:\LaraMarcosOCR`.
2. Comprobar las huellas (opcional): en PowerShell,
   `Get-FileHash C:\LaraMarcosOCR\*.exe` y comparar con `SHA256.txt`.
3. **Permisos de la carpeta** (contiene la clave del agente): Propiedades > Seguridad >
   dejar solo **Administradores**, **SYSTEM** y **automatiosrv** (control total).

## 2. Configurar `config.json`

Abrir `C:\LaraMarcosOCR\config.json` con el Bloc de notas:

| Campo | Valor |
|---|---|
| `raiz` | `D:\\DocumentacionLM` (ruta **local**, con barras dobles) |
| `clave` | la clave `AGENTE_SECRET` de la app (la pega Automatio; no se manda por correo) |
| `clientes` | carpetas de los clientes a procesar. Lista vacía `[]` = **todos** (ver más abajo) |
| `desde` | `2026-4T`: lo anterior no se toca |
| `intervaloSegundos` | cada cuánto revisa las carpetas (120 = 2 min) |
| `horario` | `null` = siempre, o `{ "desde": "07:00", "hasta": "22:00" }` |
| `crearCarpetas` | `true`: crea las carpetas del trimestre en cada cliente |
| `enParalelo` | facturas a la vez (2) |
| `segundosEstable` | espera a que un fichero lleve este tiempo sin cambiar antes de leerlo (60) |

## 3. Comprobar antes de instalar (como el usuario de servicio)

En un símbolo del sistema:

```
runas /user:automatiosrv cmd
```

En la ventana nueva:

```
cd C:\LaraMarcosOCR
LaraMarcosOCR.exe --comprobar
```

Todo debe salir con ✓: clientes del piloto con su carpeta CONTABILIDAD, permiso de
escritura, conexión con la app y clave aceptada. Si algo sale con ✗, se corrige antes de
seguir. (Esta prueba no envía ninguna factura.)

## 4. Instalar el servicio (símbolo del sistema **como administrador**)

```
cd C:\LaraMarcosOCR
LaraMarcosOCR-servicio.exe install
```

## 5. Poner la cuenta del servicio

1. `services.msc` > **LaraMarcos OCR (precontabilización)** > Propiedades > **Iniciar sesión**.
2. **Esta cuenta**: `.\automatiosrv` (o `DOMINIO\automatiosrv`) y su contraseña.
3. Aceptar. Windows le da el derecho "Iniciar sesión como servicio".

Así la contraseña no queda escrita en ningún fichero.

## 6. Arrancar y verificar

```
LaraMarcosOCR-servicio.exe start
LaraMarcosOCR-servicio.exe status
```

- Registro: `C:\LaraMarcosOCR\logs\agente-AAAA-MM-DD.log` (uno por día).
- En la primera pasada crea `AÑO 2026\4º TRIMESTRE\GASTOS` e `INGRESOS` en los clientes del piloto.
- Prueba: dejar una factura en `GASTOS` de un cliente del piloto. A los ~2-3 minutos
  aparece en la app (Precontabilización) y el Excel en la carpeta del trimestre.

---

## Uso diario

| Para… | Hacer |
|---|---|
| Parar / arrancar / reiniciar | `LaraMarcosOCR-servicio.exe stop` / `start` / `restart` (o desde `services.msc`) |
| Cambiar la configuración (clientes, horario…) | editar `config.json` y **reiniciar** el servicio |
| Pasar a todos los clientes | `"clientes": []`, ejecutar `LaraMarcosOCR.exe --comprobar` (revisar `datos\carpetas-sin-cliente.txt`) y reiniciar |
| Cambiar la contraseña de `automatiosrv` | `services.msc` > Iniciar sesión > nueva contraseña > reiniciar |
| Cambiar la ruta (p. ej. otro disco u otro nombre de servidor) | `raiz` en `config.json` y reiniciar. No hace falta reinstalar |
| Ver qué ha hecho | `logs\agente-AAAA-MM-DD.log` |
| Actualizar el programa | `stop`, sustituir `LaraMarcosOCR.exe`, `start` (config y datos se conservan) |
| Desinstalar | `stop` y `uninstall`; borrar la carpeta |

`datos\estado.json` guarda qué ficheros se han enviado ya. **No borrarlo**: si se borra, el
agente vuelve a mandar todo (la app reconoce los duplicados, pero gasta tiempo y lectura de IA).

## Todos los clientes (`"clientes": []`)

- El agente pide a la app la lista de **clientes activos** y empareja cada carpeta de cliente
  con el suyo (por nombre, NIF o código, dentro de su oficina).
- **Solo crea las carpetas del trimestre en las carpetas de clientes activos.** En las de
  antiguos clientes no crea nada.
- Las carpetas que no emparejan se anotan en `datos\carpetas-sin-cliente.txt`. Si alguna es
  de un cliente activo, hay que corregir el nombre de la carpeta o el de la ficha en la app.
- Si alguien deja una factura en una carpeta sin cliente, **no se pierde**: llega a la app
  como "Sin cliente" (en rojo) para asignarla.
- `--comprobar` muestra, por oficina, cuántas carpetas emparejan, cuántas no y cuántos
  clientes activos no tienen carpeta.

## Cómo trabaja

- Revisa las carpetas cada `intervaloSegundos`. Un fichero se lee cuando lleva
  `segundosEstable` sin cambiar (para no leer uno que se está copiando).
- Facturas sueltas (PDF, JPG, PNG) o un **PDF con varias facturas**: lo separa, incluidas
  las de varias páginas. Si un corte no está claro, la factura sale marcada para revisar.
- Si la app no responde, reintenta más tarde (2, 4, 8… minutos). Tras 8 intentos lo deja
  anotado en el registro para revisarlo a mano.
- Facturas de **más de 4 MB**: no se pueden mandar desde aquí; el registro lo indica y se
  suben desde la app (admite hasta 45 MB).
- El Excel se regenera entero cada vez que cambia algo en ese libro (también si se corrige
  en la app). Si alguien lo tiene **abierto**, se actualiza en la siguiente pasada.

## Problemas frecuentes

| Síntoma en el registro | Causa / solución |
|---|---|
| `La app rechaza la clave (401)` | `clave` mal copiada en `config.json` |
| `Sin conexión con la app` | salida HTTPS bloqueada (cortafuegos/proxy) o la app caída; reintenta solo |
| `No encuentro la carpeta del cliente "…"` | el nombre en `clientes` no coincide con la carpeta |
| `no tiene carpeta de CONTABILIDAD` | ese cliente no tiene carpeta CONTABILIDAD (06/07…) |
| `Sin permiso` / `EPERM` al crear carpetas | permisos de `automatiosrv` en esa carpeta |
| `está abierto o bloqueado` | el Excel está abierto; se reintenta solo |
| El antivirus para el programa | excepción para `C:\LaraMarcosOCR` |
