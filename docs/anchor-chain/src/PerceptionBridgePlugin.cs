using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using BepInEx;
using BepInEx.Configuration;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace SeaPowerPerceptionBridge
{
    [BepInPlugin("com.admiral.perceptionbridge", "Sea Power Perception Bridge", "1.0.0")]
    public class PerceptionBridgePlugin : BaseUnityPlugin
    {
        private static UdpClient _telemetryUdpClient;
        private static UdpClient _commandUdpClient;
        private static IPEndPoint _remoteEndPoint;
        private static List<string> _commandQueue = new List<string>();
        private static readonly object _queueLock = new object();
        private static volatile bool _isShuttingDown = false;
        private readonly List<Transform> _trackedTransforms = new List<Transform>();

        private float _timer = 0f;
        private float _cacheRefreshTimer = 999f;
        private bool _warnedCommandsDisabled = false;

        private ConfigEntry<bool> _telemetryEnabled;
        private ConfigEntry<bool> _commandExecutionEnabled;
        private ConfigEntry<float> _telemetryIntervalSeconds;
        private ConfigEntry<float> _objectCacheRefreshSeconds;
        private ConfigEntry<int> _maxTelemetryObjects;
        private ConfigEntry<int> _maxCommandsPerFrame;
        private ConfigEntry<int> _maxCommandBytes;

        private void Awake()
        {
            _isShuttingDown = false;
            _telemetryEnabled = Config.Bind("Safety", "TelemetryEnabled", true, "Broadcast read-only game telemetry to the dashboard.");
            _commandExecutionEnabled = Config.Bind("Safety", "CommandExecutionEnabled", false, "Apply dashboard/LLM UDP commands to Unity objects. Disabled by default to reduce crash risk.");
            _telemetryIntervalSeconds = Config.Bind("Safety", "TelemetryIntervalSeconds", 8.0f, "Seconds between telemetry updates. Higher values reduce in-game stutter.");
            _objectCacheRefreshSeconds = Config.Bind("Safety", "ObjectCacheRefreshSeconds", 30.0f, "Seconds between expensive scene-wide object discovery scans.");
            _maxTelemetryObjects = Config.Bind("Safety", "MaxTelemetryObjects", 80, "Maximum relevant objects to serialize per telemetry side.");
            _maxCommandsPerFrame = Config.Bind("Safety", "MaxCommandsPerFrame", 3, "Maximum queued UDP commands processed per Unity frame.");
            _maxCommandBytes = Config.Bind("Safety", "MaxCommandBytes", 4096, "Maximum accepted UDP command packet size in bytes.");

            try
            {
                // Telemetry Broadcast Sender (Port 9090)
                _telemetryUdpClient = new UdpClient();
                _remoteEndPoint = new IPEndPoint(IPAddress.Parse("127.0.0.1"), 9090);
            }
            catch (Exception ex)
            {
                Logger.LogError("Telemetry UDP init error: " + ex.Message);
            }

            try
            {
                // LLM Command Receiver Listener (Port 9091)
                _commandUdpClient = new UdpClient(9091);
                _commandUdpClient.BeginReceive(new AsyncCallback(OnCommandReceived), null);
                Logger.LogInfo("Perception Bridge command receiver listening on UDP 9091.");
            }
            catch (Exception ex)
            {
                Logger.LogWarning("Command receiver disabled; UDP 9091 init failed: " + ex.Message);
            }

            Logger.LogInfo("Perception Bridge active. Telemetry=" + _telemetryEnabled.Value + ", CommandExecution=" + _commandExecutionEnabled.Value + ".");
        }

        private void OnCommandReceived(IAsyncResult ar)
        {
            try
            {
                if (_isShuttingDown || _commandUdpClient == null) return;

                IPEndPoint endPoint = new IPEndPoint(IPAddress.Any, 0);
                byte[] bytes = _commandUdpClient.EndReceive(ar, ref endPoint);
                if (bytes != null && bytes.Length > 0 && bytes.Length <= _maxCommandBytes.Value)
                {
                    string jsonCmd = Encoding.UTF8.GetString(bytes);
                    lock (_queueLock)
                    {
                        if (_commandQueue.Count >= 50)
                        {
                            _commandQueue.RemoveAt(0);
                        }
                        _commandQueue.Add(jsonCmd);
                    }
                }
                else if (bytes != null && bytes.Length > _maxCommandBytes.Value)
                {
                    Logger.LogWarning("Dropped oversized command packet: " + bytes.Length + " bytes.");
                }
            }
            catch (Exception ex)
            {
                if (!_isShuttingDown)
                {
                    Logger.LogWarning("Command receive error: " + ex.Message);
                }
            }
            finally
            {
                try
                {
                    if (!_isShuttingDown && _commandUdpClient != null)
                    {
                        _commandUdpClient.BeginReceive(new AsyncCallback(OnCommandReceived), null);
                    }
                }
                catch { }
            }
        }

        private void Update()
        {
            if (_isShuttingDown) return;

            // Process queued LLM Commander orders on Unity Main Thread
            ProcessPendingCommands();

            // Periodic telemetry broadcast
            _timer += Time.deltaTime;
            _cacheRefreshTimer += Time.deltaTime;
            float interval = Mathf.Max(1.0f, _telemetryIntervalSeconds.Value);
            if (_telemetryEnabled.Value && _timer >= interval)
            {
                _timer = 0f;
                SendTelemetryTick();
            }
        }

        private void ProcessPendingCommands()
        {
            List<string> commandsToProcess = new List<string>();
            lock (_queueLock)
            {
                if (_commandQueue.Count > 0)
                {
                    int count = Math.Min(_commandQueue.Count, Math.Max(1, _maxCommandsPerFrame.Value));
                    commandsToProcess.AddRange(_commandQueue.GetRange(0, count));
                    _commandQueue.RemoveRange(0, count);
                }
            }

            if (commandsToProcess.Count == 0) return;

            if (!_commandExecutionEnabled.Value)
            {
                if (!_warnedCommandsDisabled)
                {
                    Logger.LogWarning("Received command packet(s), but CommandExecutionEnabled=false. Commands are logged by the dashboard but not applied in-game.");
                    _warnedCommandsDisabled = true;
                }
                return;
            }

            Scene activeScene = SceneManager.GetActiveScene();
            if (!activeScene.isLoaded) return;

            Transform[] allTransforms = null;
            try
            {
                allTransforms = UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None);
            }
            catch { return; }

            if (allTransforms == null) return;

            foreach (string cmdJson in commandsToProcess)
            {
                try
                {
                    Logger.LogInfo("Executing LLM Commander Order: " + cmdJson);
                    
                    string targetUnit = ExtractJsonValue(cmdJson, "unit");
                    string commandType = ExtractJsonValue(cmdJson, "order");
                    float heading = ExtractJsonFloat(cmdJson, "heading", -1f);
                    float speed = ExtractJsonFloat(cmdJson, "speed", -1f);

                    if (string.IsNullOrEmpty(targetUnit) || string.IsNullOrEmpty(commandType))
                    {
                        Logger.LogWarning("Dropped malformed command packet.");
                        continue;
                    }

                    if (commandType != "CHANGE_COURSE" && commandType != "SET_SPEED")
                    {
                        Logger.LogWarning("Command type is telemetry-only in safety mode and was ignored: " + commandType);
                        continue;
                    }

                    if (heading >= 0f)
                    {
                        heading = Mathf.Repeat(heading, 360f);
                    }
                    if (speed > 0f)
                    {
                        speed = Mathf.Clamp(speed, 0f, 45f);
                    }

                    foreach (Transform tr in allTransforms)
                    {
                        if (tr == null) continue;
                        GameObject go = tr.gameObject;
                        if (go == null || !go.activeInHierarchy) continue;

                        string nameLower = go.name.ToLower();
                        if (IsCommandableObjectName(nameLower) && nameLower.Contains(targetUnit.ToLower()))
                        {
                            if (commandType == "CHANGE_COURSE" && heading >= 0f)
                            {
                                Vector3 rot = tr.eulerAngles;
                                tr.eulerAngles = new Vector3(rot.x, heading, rot.z);
                                Logger.LogInfo(string.Format("Unit '{0}' heading adjusted to {1}°", go.name, heading));
                            }

                            Rigidbody rb = go.GetComponent<Rigidbody>();
                            if (commandType == "SET_SPEED" && rb != null && speed > 0f)
                            {
                                float speedMps = speed * 0.514444f;
                                rb.linearVelocity = tr.forward * speedMps;
                                Logger.LogInfo(string.Format("Unit '{0}' speed adjusted to {1} kts", go.name, speed));
                            }

                            break;
                        }
                    }
                }
                catch (Exception ex)
                {
                    Logger.LogError("Error executing command: " + ex.Message);
                }
            }
        }

        private string ExtractJsonValue(string json, string key)
        {
            string search = "\"" + key + "\":\"";
            int idx = json.IndexOf(search);
            if (idx < 0)
            {
                search = "\"" + key + "\": \"";
                idx = json.IndexOf(search);
            }
            if (idx < 0) return "";

            int start = idx + search.Length;
            int end = json.IndexOf("\"", start);
            if (end < 0) return "";
            return json.Substring(start, end - start);
        }

        private float ExtractJsonFloat(string json, string key, float defaultValue)
        {
            string search = "\"" + key + "\":";
            int idx = json.IndexOf(search);
            if (idx < 0) return defaultValue;

            int start = idx + search.Length;
            int end = json.IndexOf(",", start);
            if (end < 0) end = json.IndexOf("}", start);
            if (end < 0) return defaultValue;

            string numStr = json.Substring(start, end - start).Trim().Replace("\"", "");
            float val;
            if (float.TryParse(numStr, out val)) return val;
            return defaultValue;
        }

        private void SendTelemetryTick()
        {
            try
            {
                if (_telemetryUdpClient == null || _remoteEndPoint == null) return;

                Scene activeScene = SceneManager.GetActiveScene();
                if (!activeScene.isLoaded || string.IsNullOrEmpty(activeScene.name)) return;
                
                string sceneName = activeScene.name;
                string sceneLower = sceneName.ToLower();
                if (sceneLower.Contains("menu") || sceneLower.Contains("load")) return;

                List<string> bluforUnitJsons = new List<string>();
                List<string> opforUnitJsons = new List<string>();
                List<string> bluforContactJsons = new List<string>();
                List<string> opforContactJsons = new List<string>();

                if (_cacheRefreshTimer >= Mathf.Max(10.0f, _objectCacheRefreshSeconds.Value) || _trackedTransforms.Count == 0)
                {
                    RefreshTrackedTransforms();
                }

                if (_trackedTransforms.Count > 0)
                {
                    HashSet<int> processedInstanceIds = new HashSet<int>();
                    Transform[] trackedSnapshot = _trackedTransforms.ToArray();

                    for (int i = 0; i < trackedSnapshot.Length; i++)
                    {
                        try
                        {
                            Transform tr = trackedSnapshot[i];
                            if (ReferenceEquals(tr, null) || tr == null) continue;

                            GameObject go = tr.gameObject;
                            if (ReferenceEquals(go, null) || go == null || !go.activeInHierarchy) continue;

                            int instId = go.GetInstanceID();
                            if (processedInstanceIds.Contains(instId)) continue;
                            processedInstanceIds.Add(instId);

                            string objName = go.name;
                            if (string.IsNullOrEmpty(objName)) continue;
                            string nameLower = objName.ToLower();

                            if (!IsTelemetryCandidateName(nameLower))
                            {
                                continue;
                            }

                            Vector3 pos = tr.position;
                            Vector3 rot = tr.eulerAngles;
                            float posXNM = pos.x / 1852.0f;
                            float posZNM = pos.z / 1852.0f;
                            float altitudeMeters = pos.y;
                            float headingDeg = rot.y;
                            float pitchDeg = rot.x;
                            float rollDeg = rot.z;

                            float realSpeedKts = 0f;
                            Rigidbody rb = go.GetComponent<Rigidbody>();
                            if (rb != null)
                            {
                                realSpeedKts = rb.linearVelocity.magnitude * 1.94384f;
                            }

                            string parentName = tr.parent != null ? tr.parent.name : "ROOT";
                            string layerName = LayerMask.LayerToName(go.layer);
                            string tagStr = go.tag;

                            // Check for Aircraft / Helicopters (SH-60, SH-2, Ka-25, Ka-27, F-14, A-6)
                            bool isAircraft = nameLower.Contains("heli") || nameLower.Contains("sh60") || nameLower.Contains("sh2") || 
                                               nameLower.Contains("ka25") || nameLower.Contains("ka27") || nameLower.Contains("f14") || nameLower.Contains("a6");

                            if (isAircraft)
                            {
                                bool isEmbarked = altitudeMeters < 5.0f;
                                string statusStr = isEmbarked ? "EMBARKED_STORAGE" : "IN_FLIGHT";
                                string acName = objName;

                                string acJson = string.Format(
                                    "{{\"id\":\"{0}\",\"name\":\"{1}\",\"type\":\"Aircraft\",\"posX\":{2:F2},\"posZ\":{3:F2},\"altitudeMeters\":{4:F1},\"heading\":{5:F0},\"speed\":{6:F0},\"status\":\"{7}\",\"isEmbarked\":{8},\"parent\":\"{9}\"}}",
                                    instId,
                                    EscapeJson(acName),
                                    posXNM,
                                    posZNM,
                                    altitudeMeters,
                                    headingDeg,
                                    realSpeedKts,
                                    statusStr,
                                    isEmbarked ? "true" : "false",
                                    EscapeJson(parentName)
                                );

                                if (nameLower.Contains("sh60") || nameLower.Contains("sh2") || nameLower.Contains("usn") || nameLower.Contains("f14") || nameLower.Contains("a6"))
                                {
                                    AddCapped(bluforUnitJsons, acJson);
                                }
                                else
                                {
                                    AddCapped(opforUnitJsons, acJson);
                                }
                                continue;
                            }

                            // In-Flight Missiles / Ordnance
                            bool isClone = nameLower.Contains("(clone)") || nameLower.Contains("projectile") || nameLower.Contains("in_flight");
                            bool isWeaponKeyword = nameLower.Contains("rgm84") || nameLower.Contains("ssn14") || nameLower.Contains("rim66") || nameLower.Contains("san4") || nameLower.Contains("vampire");

                            if (isClone && isWeaponKeyword)
                            {
                                string missileName = objName;
                                float missileSpeedKts = realSpeedKts > 0f ? realSpeedKts : 600f;

                                string mJson = string.Format(
                                    "{{\"id\":\"{0}\",\"name\":\"{1}\",\"type\":\"Missile\",\"posX\":{2:F2},\"posZ\":{3:F2},\"altitudeMeters\":{4:F1},\"heading\":{5:F0},\"pitch\":{6:F1},\"roll\":{7:F1},\"rawX\":{8:F1},\"rawY\":{9:F1},\"rawZ\":{10:F1},\"layer\":\"{11}\",\"tag\":\"{12}\",\"parent\":\"{13}\",\"speed\":{14:F0},\"status\":\"IN_FLIGHT\"}}",
                                    instId,
                                    EscapeJson(missileName),
                                    posXNM,
                                    posZNM,
                                    altitudeMeters,
                                    headingDeg,
                                    pitchDeg,
                                    rollDeg,
                                    pos.x,
                                    pos.y,
                                    pos.z,
                                    EscapeJson(layerName),
                                    EscapeJson(tagStr),
                                    EscapeJson(parentName),
                                    missileSpeedKts
                                );

                                if (nameLower.Contains("rgm84") || nameLower.Contains("rim66"))
                                {
                                    AddCapped(bluforUnitJsons, mJson);
                                    string cJson = string.Format(
                                        "{{\"id\":\"VAMPIRE-{0}\",\"bearing\":{1:F0},\"rangeNM\":{2:F1},\"posX\":{3:F2},\"posZ\":{4:F2},\"altitudeMeters\":{5:F1},\"classEst\":\"VAMPIRE (Inbound ASM/SAM)\",\"confidence\":0.95,\"layer\":\"{6}\",\"tag\":\"{7}\"}}",
                                        instId,
                                        headingDeg,
                                        Math.Sqrt(posXNM * posXNM + posZNM * posZNM),
                                        posXNM,
                                        posZNM,
                                        altitudeMeters,
                                        EscapeJson(layerName),
                                        EscapeJson(tagStr)
                                    );
                                    AddCapped(opforContactJsons, cJson);
                                }
                                else
                                {
                                    AddCapped(opforUnitJsons, mJson);
                                    string cJson = string.Format(
                                        "{{\"id\":\"VAMPIRE-{0}\",\"bearing\":{1:F0},\"rangeNM\":{2:F1},\"posX\":{3:F2},\"posZ\":{4:F2},\"altitudeMeters\":{5:F1},\"classEst\":\"VAMPIRE (Inbound ASM/SAM)\",\"confidence\":0.95,\"layer\":\"{6}\",\"tag\":\"{7}\"}}",
                                        instId,
                                        headingDeg,
                                        Math.Sqrt(posXNM * posXNM + posZNM * posZNM),
                                        posXNM,
                                        posZNM,
                                        altitudeMeters,
                                        EscapeJson(layerName),
                                        EscapeJson(tagStr)
                                    );
                                    AddCapped(bluforContactJsons, cJson);
                                }
                                continue;
                            }

                            // BLUFOR Own Ships (US Navy)
                            if (nameLower.Contains("perry") || nameLower.Contains("usn_ffg") || nameLower.Contains("usn_cg") || nameLower.Contains("usn_ddg") || nameLower.Contains("usn_cvn"))
                            {
                                float shipSpeedKts = realSpeedKts > 0f ? realSpeedKts : 15f;

                                string uJson = string.Format(
                                    "{{\"id\":\"{0}\",\"name\":\"{1}\",\"type\":\"Ship\",\"posX\":{2:F2},\"posZ\":{3:F2},\"altitudeMeters\":{4:F1},\"heading\":{5:F0},\"pitch\":{6:F1},\"roll\":{7:F1},\"rawX\":{8:F1},\"rawY\":{9:F1},\"rawZ\":{10:F1},\"layer\":\"{11}\",\"tag\":\"{12}\",\"parent\":\"{13}\",\"speed\":{14:F0},\"status\":\"OPERATIONAL\"}}",
                                    instId,
                                    EscapeJson(objName),
                                    posXNM,
                                    posZNM,
                                    altitudeMeters,
                                    headingDeg,
                                    pitchDeg,
                                    rollDeg,
                                    pos.x,
                                    pos.y,
                                    pos.z,
                                    EscapeJson(layerName),
                                    EscapeJson(tagStr),
                                    EscapeJson(parentName),
                                    shipSpeedKts
                                );
                                AddCapped(bluforUnitJsons, uJson);
                            }
                            // OPFOR Own Ships (Soviet Navy)
                            else if (nameLower.Contains("krivak") || nameLower.Contains("vmf_skr") || nameLower.Contains("vmf_ddg") || nameLower.Contains("vmf_cg") || nameLower.Contains("vmf_takr"))
                            {
                                float shipSpeedKts = realSpeedKts > 0f ? realSpeedKts : 15f;

                                string uJson = string.Format(
                                    "{{\"id\":\"{0}\",\"name\":\"{1}\",\"type\":\"Ship\",\"posX\":{2:F2},\"posZ\":{3:F2},\"altitudeMeters\":{4:F1},\"heading\":{5:F0},\"pitch\":{6:F1},\"roll\":{7:F1},\"rawX\":{8:F1},\"rawY\":{9:F1},\"rawZ\":{10:F1},\"layer\":\"{11}\",\"tag\":\"{12}\",\"parent\":\"{13}\",\"speed\":{14:F0},\"status\":\"OPERATIONAL\"}}",
                                    instId,
                                    EscapeJson(objName),
                                    posXNM,
                                    posZNM,
                                    altitudeMeters,
                                    headingDeg,
                                    pitchDeg,
                                    rollDeg,
                                    pos.x,
                                    pos.y,
                                    pos.z,
                                    EscapeJson(layerName),
                                    EscapeJson(tagStr),
                                    EscapeJson(parentName),
                                    shipSpeedKts
                                );
                                AddCapped(opforUnitJsons, uJson);
                            }
                        }
                        catch { }
                    }
                }

                string timeStr = DateTime.Now.ToString("HH:mm:ss");

                string bluforPayload = string.Format(
                    "{{\"faction\":\"BLUFOR\",\"scene\":\"{0}\",\"timestamp\":\"{1}\",\"units\":[{2}],\"contacts\":[{3}]}}",
                    EscapeJson(sceneName),
                    timeStr,
                    string.Join(",", bluforUnitJsons.ToArray()),
                    string.Join(",", bluforContactJsons.ToArray())
                );
                byte[] bluforBytes = Encoding.UTF8.GetBytes(bluforPayload);
                _telemetryUdpClient.Send(bluforBytes, bluforBytes.Length, _remoteEndPoint);

                string opforPayload = string.Format(
                    "{{\"faction\":\"OPFOR\",\"scene\":\"{0}\",\"timestamp\":\"{1}\",\"units\":[{2}],\"contacts\":[{3}]}}",
                    EscapeJson(sceneName),
                    timeStr,
                    string.Join(",", opforUnitJsons.ToArray()),
                    string.Join(",", opforContactJsons.ToArray())
                );
                byte[] opforBytes = Encoding.UTF8.GetBytes(opforPayload);
                _telemetryUdpClient.Send(opforBytes, opforBytes.Length, _remoteEndPoint);
            }
            catch { }
        }

        private string EscapeJson(string str)
        {
            if (string.IsNullOrEmpty(str)) return "";
            return str.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        private void AddCapped(List<string> items, string json)
        {
            if (items == null || json == null) return;
            if (items.Count >= Math.Max(1, _maxTelemetryObjects.Value)) return;
            items.Add(json);
        }

        private void RefreshTrackedTransforms()
        {
            _cacheRefreshTimer = 0f;
            _trackedTransforms.Clear();

            Transform[] allTransforms = null;
            try
            {
                allTransforms = UnityEngine.Object.FindObjectsByType<Transform>(FindObjectsSortMode.None);
            }
            catch (Exception ex)
            {
                Logger.LogWarning("Telemetry object discovery skipped: " + ex.Message);
                return;
            }

            if (allTransforms == null) return;

            int cap = Math.Max(1, _maxTelemetryObjects.Value) * 2;
            for (int i = 0; i < allTransforms.Length && _trackedTransforms.Count < cap; i++)
            {
                try
                {
                    Transform tr = allTransforms[i];
                    if (ReferenceEquals(tr, null) || tr == null) continue;
                    GameObject go = tr.gameObject;
                    if (ReferenceEquals(go, null) || go == null || !go.activeInHierarchy) continue;

                    string objName = go.name;
                    if (string.IsNullOrEmpty(objName)) continue;

                    if (IsTelemetryCandidateName(objName.ToLower()))
                    {
                        _trackedTransforms.Add(tr);
                    }
                }
                catch { }
            }
        }

        private bool IsTelemetryCandidateName(string nameLower)
        {
            if (string.IsNullOrEmpty(nameLower)) return false;
            if (IsExcludedSubcomponentName(nameLower)) return false;
            return IsShipName(nameLower) || IsAircraftName(nameLower) || IsMissileName(nameLower);
        }

        private bool IsExcludedSubcomponentName(string nameLower)
        {
            return nameLower.Contains("ciws") || nameLower.Contains("_gun") || nameLower.EndsWith("gun") ||
                   nameLower.Contains("cannon") || nameLower.Contains("launcher") || nameLower.Contains("mount") ||
                   nameLower.Contains("turret") || nameLower.Contains("director") || nameLower.Contains("sensor") ||
                   nameLower.Contains("radar") || nameLower.Contains("sonar") || nameLower.Contains("bay") ||
                   nameLower.Contains("rack") || nameLower.Contains("container") || nameLower.Contains("raft") ||
                   nameLower.Contains("camera") || nameLower.Contains("light");
        }

        private bool IsShipName(string nameLower)
        {
            if (IsExcludedSubcomponentName(nameLower)) return false;
            return nameLower.Contains("perry") || nameLower.Contains("usn_ffg") || nameLower.Contains("usn_cg") ||
                   nameLower.Contains("usn_ddg") || nameLower.Contains("usn_cvn") || nameLower.Contains("krivak") ||
                   nameLower.Contains("vmf_skr") || nameLower.Contains("vmf_ddg") || nameLower.Contains("vmf_cg") ||
                   nameLower.Contains("vmf_takr");
        }

        private bool IsAircraftName(string nameLower)
        {
            if (IsExcludedSubcomponentName(nameLower)) return false;
            return nameLower.Contains("heli") || nameLower.Contains("sh60") || nameLower.Contains("sh2") ||
                   nameLower.Contains("ka25") || nameLower.Contains("ka27") || nameLower.Contains("f14") ||
                   nameLower.Contains("a6");
        }

        private bool IsMissileName(string nameLower)
        {
            if (IsExcludedSubcomponentName(nameLower)) return false;
            bool isClone = nameLower.Contains("(clone)") || nameLower.Contains("projectile") || nameLower.Contains("in_flight");
            bool isWeaponKeyword = nameLower.Contains("rgm84") || nameLower.Contains("ssn14") ||
                                   nameLower.Contains("rim66") || nameLower.Contains("san4") ||
                                   nameLower.Contains("vampire");
            return isClone && isWeaponKeyword;
        }

        private bool IsCommandableObjectName(string nameLower)
        {
            if (string.IsNullOrEmpty(nameLower)) return false;
            if (nameLower.Contains("missile") || nameLower.Contains("projectile") || nameLower.Contains("(clone)")) return false;
            return IsShipName(nameLower);
        }

        private void OnDestroy()
        {
            _isShuttingDown = true;
            try
            {
                if (_telemetryUdpClient != null) _telemetryUdpClient.Close();
                if (_commandUdpClient != null) _commandUdpClient.Close();
            }
            catch { }
        }
    }
}
