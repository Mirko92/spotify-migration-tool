import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Alert,
  LinearProgress,
  Collapse,
  Chip,
  Divider,
  Grid
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HomeIcon from '@mui/icons-material/Home';
import LogViewer from '../components/LogViewer';
import { migrate } from '../services/spotifyService';

const Migration = ({ authStatus }) => {
  const navigate = useNavigate();
  const [migrationStarted, setMigrationStarted] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('in_progress');
  const [migrationLog, setMigrationLog] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationData, setMigrationData] = useState(null);
  const [progress, setProgress] = useState({ percent: 0, currentItem: '' });
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    try {
      // Recupera le selezioni da localStorage
      const selectedPlaylists = JSON.parse(localStorage.getItem('selectedPlaylists') || '[]');
      const selectedSavedTracks = JSON.parse(localStorage.getItem('selectedSavedTracks') || 'false');
      const selectedSavedTrackIds = JSON.parse(localStorage.getItem('selectedSavedTrackIds') || '[]');
      const selectedFollowedArtists = JSON.parse(localStorage.getItem('selectedFollowedArtists') || 'false');
      const selectedFollowedArtistIds = JSON.parse(localStorage.getItem('selectedFollowedArtistIds') || '[]');

      // Verifica se almeno una delle selezioni contiene elementi
      const hasData =
        selectedPlaylists.length > 0 ||
        (selectedSavedTracks && selectedSavedTrackIds.length > 0) ||
        (selectedFollowedArtists && selectedFollowedArtistIds.length > 0);

      if (!hasData) {
        navigate('/preview');
        return;
      }

      // Crea l'oggetto migrationData
      const migrationData = {
        playlists: selectedPlaylists,
        savedTracks: selectedSavedTracks,
        savedTrackIds: selectedSavedTrackIds,
        followedArtists: selectedFollowedArtists,
        followedArtistIds: selectedFollowedArtistIds
      };

      setMigrationData(migrationData);
      setLoading(false);
    } catch (error) {
      console.error('Error parsing migration data:', error);
      toast.error('Errore nel caricamento dei dati di migrazione');
      navigate('/preview');
    }
  }, [navigate]);

  const startMigration = async () => {
    try {
      setMigrationStarted(true);
      setLoading(true);
      setProgress({ percent: 0, currentItem: 'Inizializzazione...' });

      // Invia la richiesta di migrazione con callback di progresso
      const response = await migrate(
        {
          ...migrationData,
          followNonUserPlaylists: true,
          transferImages: true
        },
        (progressUpdate) => {
          setProgress({
            percent: progressUpdate.percent,
            currentItem: progressUpdate.currentItem
          });
          if (progressUpdate.log) {
            setMigrationLog(progressUpdate.log);
          }
          if (progressUpdate.errors) {
            setErrors(progressUpdate.errors);
          }
        }
      );

      // Aggiorna lo stato finale
      setMigrationStatus(response.success ? 'completed' : 'failed');
      setMigrationLog(response.log || []);
      setErrors(response.errors || []);
      setProgress(prev => ({ ...prev, percent: 100, currentItem: 'Completato' }));

      // Pulisci il localStorage
      localStorage.removeItem('selectedPlaylists');
      localStorage.removeItem('selectedSavedTracks');
      localStorage.removeItem('selectedSavedTrackIds');
      localStorage.removeItem('selectedFollowedArtists');
      localStorage.removeItem('selectedFollowedArtistIds');
    } catch (error) {
      console.error('Error during migration:', error);
      setMigrationStatus('failed');
      setErrors(prev => [...prev, error.message]);
    } finally {
      setLoading(false);
    }
  };

  // Caricamento iniziale dei dati
  if (loading && !migrationStarted) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Caricamento dati...
        </Typography>
      </Container>
    );
  }

  // 1. Pagina di riepilogo prima di avviare la migrazione
  if (!migrationStarted) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom fontWeight="700">
          Riepilogo Migrazione
        </Typography>

        <Paper elevation={3} sx={{ p: 4, borderRadius: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom fontWeight="600">
            Elementi da migrare
          </Typography>

          <Typography variant="body1" paragraph color="text.secondary">
            Stai per migrare i seguenti elementi da <strong>{authStatus.sourceUser?.display_name || 'Account Sorgente'}</strong> a <strong>{authStatus.destUser?.display_name || 'Account Destinazione'}</strong>:
          </Typography>

          <List sx={{ width: '100%', maxWidth: 450, mx: 'auto', bgcolor: 'background.paper', borderRadius: 2, mb: 3 }}>
            {migrationData?.playlists.length > 0 && (
              <ListItem>
                <ListItemText
                  primary={`${migrationData.playlists.length} Playlist`}
                  secondary="Verranno clonate le tue playlist e seguite quelle di terzi"
                />
              </ListItem>
            )}

            {migrationData?.savedTracks && migrationData.savedTrackIds.length > 0 && (
              <ListItem>
                <ListItemText
                  primary={`${migrationData.savedTrackIds.length} Brani Preferiti`}
                  secondary="Verranno salvati nella libreria dell'account destinazione"
                />
              </ListItem>
            )}

            {migrationData?.followedArtists && migrationData.followedArtistIds.length > 0 && (
              <ListItem>
                <ListItemText
                  primary={`${migrationData.followedArtistIds.length} Artisti Seguiti`}
                  secondary="Verranno seguiti dall'account destinazione"
                />
              </ListItem>
            )}
          </List>

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 4 }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={<PlayArrowIcon />}
              onClick={startMigration}
              sx={{ px: 4, py: 1.5, fontWeight: 700 }}
            >
              Avvia Migrazione
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate('/preview')}
            >
              Torna alla selezione
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  // 2. Schermata di avanzamento durante la migrazione
  if (loading && migrationStarted) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Paper elevation={4} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom fontWeight="700">
            Migrazione in Corso
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            Non chiudere questa finestra. Il tool sta sincronizzando i contenuti con Spotify.
          </Typography>

          {/* Barra di progresso con percentuale */}
          <Box sx={{ width: '100%', mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: '70%', textAlign: 'left' }}>
                {progress.currentItem || 'Elaborazione in corso...'}
              </Typography>
              <Typography variant="h6" fontWeight="700" color="primary.main">
                {progress.percent}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress.percent}
              sx={{
                height: 14,
                borderRadius: 7,
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                '& .MuiLinearProgress-bar': {
                  background: 'linear-gradient(90deg, #1DB954 0%, #1ed760 100%)',
                  borderRadius: 7
                }
              }}
            />
          </Box>

          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="text"
              size="small"
              startIcon={<ListAltIcon />}
              endIcon={showLogs ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setShowLogs(prev => !prev)}
            >
              {showLogs ? 'Nascondi Log in tempo reale' : 'Mostra Log in tempo reale'}
            </Button>
          </Box>

          {/* Specchietto dei log su richiesta durante il processo */}
          <Collapse in={showLogs}>
            <Box sx={{ mt: 2, textAlign: 'left' }}>
              <LogViewer
                logs={migrationLog}
                title="Log in Tempo Reale"
                maxHeight="260px"
                showControls={false}
              />
            </Box>
          </Collapse>
        </Paper>
      </Container>
    );
  }

  // 3. Schermata finale di completamento
  const hasErrors = errors.length > 0;
  const isFullySuccessful = migrationStatus === 'completed' && !hasErrors;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
        {/* Banner di stato */}
        {isFullySuccessful ? (
          <Alert
            severity="success"
            icon={<CheckCircleIcon fontSize="inherit" />}
            sx={{ mb: 4, borderRadius: 2 }}
          >
            <Typography variant="h6" fontWeight="700">
              Migrazione Completata con Successo!
            </Typography>
            Tutti i contenuti selezionati sono stati trasferiti correttamente sul tuo account Spotify di destinazione.
          </Alert>
        ) : (
          <Alert
            severity={hasErrors ? "warning" : "error"}
            icon={hasErrors ? <WarningAmberIcon fontSize="inherit" /> : <ErrorOutlineIcon fontSize="inherit" />}
            sx={{ mb: 4, borderRadius: 2 }}
          >
            <Typography variant="h6" fontWeight="700">
              {hasErrors ? 'Migrazione terminata con alcune segnalazioni' : 'Errore durante la migrazione'}
            </Typography>
            {hasErrors
              ? 'Alcuni elementi potrebbero non essere stati trasferiti completamente. Controlla il dettaglio errori sotto.'
              : 'Si è verificato un errore durante l’operazione.'}
          </Alert>
        )}

        {/* Barra al 100% */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Avanzamento complessivo
            </Typography>
            <Typography variant="body2" fontWeight="700" color="primary.main">
              100%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={100}
            sx={{
              height: 10,
              borderRadius: 5,
              '& .MuiLinearProgress-bar': {
                backgroundColor: isFullySuccessful ? '#1DB954' : '#ff9800'
              }
            }}
          />
        </Box>

        {/* Dettaglio Errori se presenti */}
        {errors.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" color="error" fontWeight="700" gutterBottom>
              Segnalazioni ed Errori ({errors.length})
            </Typography>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                maxHeight: 180,
                overflow: 'auto',
                bgcolor: 'rgba(211, 47, 47, 0.08)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                borderRadius: 2
              }}
            >
              {errors.map((error, index) => (
                <Typography key={index} variant="body2" color="error.main" sx={{ mb: 0.5, fontFamily: 'monospace' }}>
                  • {error}
                </Typography>
              ))}
            </Paper>
          </Box>
        )}

        {/* Specchietto dei Log su richiesta */}
        <Box sx={{ mb: 4 }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<ListAltIcon />}
            endIcon={showLogs ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setShowLogs(prev => !prev)}
            sx={{ mb: 1 }}
          >
            {showLogs ? 'Nascondi Specchietto dei Log' : `Mostra Specchietto dei Log (${migrationLog.length})`}
          </Button>

          <Collapse in={showLogs}>
            <LogViewer
              logs={migrationLog}
              title="Dettaglio Operazioni"
              maxHeight="320px"
              showControls={true}
            />
          </Collapse>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Pulsanti di navigazione */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/preview')}
            sx={{ px: 3, fontWeight: 700 }}
          >
            Nuova Migrazione
          </Button>
          <Button
            variant="outlined"
            startIcon={<HomeIcon />}
            onClick={() => navigate('/')}
            sx={{ px: 3 }}
          >
            Torna alla Home
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default Migration;
