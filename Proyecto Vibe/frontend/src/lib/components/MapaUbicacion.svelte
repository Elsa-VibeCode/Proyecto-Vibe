<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { Map, Marker } from 'leaflet';
  import 'leaflet/dist/leaflet.css';

  interface Props {
    altura?: string;
  }

  let { altura = '500px' }: Props = $props();

  let contenedor: HTMLDivElement;
  let mapa: Map | null = null;
  let marcador: Marker | null = null;

  let cargando = $state(false);
  let error = $state('');
  let ubicacion = $state<{ lat: number; lng: number; precision?: number } | null>(null);
  let permiso = $state<'pendiente' | 'concedido' | 'denegado' | 'no-soportado'>('pendiente');

  const centroMexico = { lat: 19.4326, lng: -99.1332, zoom: 5 };

  function formatearCoordenada(valor: number): string {
    return valor.toFixed(6);
  }

  function actualizarMarcador(lat: number, lng: number, mensaje: string) {
    if (!mapa) return;

    if (marcador) {
      marcador.setLatLng([lat, lng]).setPopupContent(mensaje).openPopup();
    } else {
      import('$lib/leaflet').then((mod) => {
        const L = mod.default;
        marcador = L.marker([lat, lng]).addTo(mapa!).bindPopup(mensaje).openPopup();
      });
    }

    mapa.setView([lat, lng], 15);
  }

  function obtenerUbicacion() {
    if (!browser) return;

    if (!navigator.geolocation) {
      permiso = 'no-soportado';
      error = 'Tu navegador no soporta geolocalización.';
      return;
    }

    cargando = true;
    error = '';

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const { latitude, longitude, accuracy } = posicion.coords;
        ubicacion = { lat: latitude, lng: longitude, precision: accuracy };
        permiso = 'concedido';
        cargando = false;

        actualizarMarcador(
          latitude,
          longitude,
          `<strong>Tu ubicación</strong><br>Lat: ${formatearCoordenada(latitude)}<br>Lng: ${formatearCoordenada(longitude)}`
        );
      },
      (err) => {
        cargando = false;
        permiso = 'denegado';

        const mensajes: Record<number, string> = {
          1: 'Permiso denegado. Habilita el acceso a ubicación en tu navegador.',
          2: 'No se pudo obtener la ubicación. Intenta de nuevo.',
          3: 'La solicitud de ubicación tardó demasiado.',
        };

        error = mensajes[err.code] || 'Error al obtener la ubicación.';
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }

  onMount(async () => {
    if (!browser || !contenedor) return;

    const L = (await import('$lib/leaflet')).default;

    mapa = L.map(contenedor).setView([centroMexico.lat, centroMexico.lng], centroMexico.zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);

    obtenerUbicacion();
  });

  onDestroy(() => {
    mapa?.remove();
    mapa = null;
    marcador = null;
  });
</script>

<div class="mapa-contenedor">
  <div class="mapa-toolbar">
    <div class="info">
      <h3>Mapa de ubicación</h3>
      {#if ubicacion}
        <p>
          Lat: {formatearCoordenada(ubicacion.lat)}, Lng: {formatearCoordenada(ubicacion.lng)}
          {#if ubicacion.precision}
            · Precisión: ~{Math.round(ubicacion.precision)} m
          {/if}
        </p>
      {:else if cargando}
        <p>Solicitando acceso a tu ubicación...</p>
      {:else if permiso === 'denegado'}
        <p>Activa el permiso de ubicación para ver tu posición en el mapa.</p>
      {:else}
        <p>Presiona el botón para mostrar tu ubicación actual.</p>
      {/if}
    </div>

    <button class="btn btn-primary" onclick={obtenerUbicacion} disabled={cargando}>
      {cargando ? 'Localizando...' : 'Mi ubicación'}
    </button>
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <div class="mapa" bind:this={contenedor} style:height={altura}></div>
</div>

<style>
  .mapa-contenedor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .mapa-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .info h3 {
    font-size: 1rem;
    margin-bottom: 0.25rem;
  }

  .info p {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .mapa {
    width: 100%;
    border-radius: calc(var(--radius) + 2px);
    border: 1px solid var(--color-border);
    overflow: hidden;
    z-index: 0;
  }

  :global(.mapa .leaflet-control-attribution) {
    font-size: 0.7rem;
  }
</style>
