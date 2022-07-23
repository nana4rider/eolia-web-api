# eolia-web-api

Eolia Web API

Web APIは`Alexa.ThermostatController`で使う分のみで、細かい操作はMQTTのみ対応しています。

# データベース構成の変更
```
npm run miggen -- [name]
npm run migrun
```

# API

## Home Assistantの設定例(MQTT)
```yml
mqtt:
  climate:
    - name: 'エアコン'
      min_temp: 16
      max_temp: 30
      temp_step: 0.5
      preset_modes: ["comfort", "boost", "eco", "sleep", "away", "cleaning"]
      current_temperature_topic: 'eolia/:deviceId/current_temperature/get'
      mode_command_topic: 'eolia/:deviceId/mode/set'
      mode_state_topic: 'eolia/:deviceId/mode/get'
      preset_mode_command_topic: 'eolia/:deviceId/preset_mode/set'
      preset_mode_state_topic: 'eolia/:deviceId/preset_mode/get'
      temperature_command_topic: 'eolia/:deviceId/temperature/set'
      temperature_state_topic: 'eolia/:deviceId/temperature/get'
      fan_mode_command_topic: 'eolia/:deviceId/fan_mode/set'
      fan_mode_state_topic: 'eolia/:deviceId/fan_mode/get'
      fan_modes: ["auto", "1", "2", "3", "4"]
      swing_mode_command_topic: 'eolia/:deviceId/swing_mode/set'
      swing_mode_state_topic: 'eolia/:deviceId/swing_mode/get'
  select:
    - name: "エアコン_ナノイーX"
      options: ["on", "off"]
      command_topic: "eolia/:deviceId/nanoex/set"
      state_topic: "eolia/:deviceId/nanoex/get"
    - name: "エアコン_上下風向"
      options: ["auto", "1", "2", "3", "4", "5"]
      command_topic: "eolia/:deviceId/wind_direction/set"
      state_topic: "eolia/:deviceId/wind_direction/get"
    - name: "エアコン_左右風向"
      options: ["auto", "to_left", "nearby_left", "front", "nearby_right", "to_right"]
      command_topic: "eolia/:deviceId/wind_direction_horizon/set"
      state_topic: "eolia/:deviceId/wind_direction_horizon/get"
    - name: "エアコン_切タイマー"
      options: ["off", "30min", "60min", "90min", "120min"]
      command_topic: "eolia/:deviceId/off_timer/set"
      state_topic: "eolia/:deviceId/off_timer/get"
```

## Web API

### エアコンの一覧を取得します
```http
GET /devices
```

### エアコンを取得します
```http
GET /devices/:id
```

### エアコンを登録します
```http
POST /devices
```

### エアコンを更新します
```http
PUT /devices/:id
```

### エアコンを削除します
```http
DELETE /devices/:id
```

### エアコンの起動状態を変更します
```http
POST /devices/:id/command/power
```
request
```json5
{
  "value": "ON|OFF|AUTO"
}
```

### エアコンの運転モードを変更します
```http
PUT /devices/:id/command/mode
```
request
```json5
{
  "value": "Auto|Cooling|Heating|CoolDehumidifying|ClothesDryer|Blast|NanoexCleaning|Cleaning|Stop"
}

### エアコンの温度設定を変更します
```http
PUT /devices/:id/command/temperature
```
request
```json5
{
  "value": 20 // 16-30
}
