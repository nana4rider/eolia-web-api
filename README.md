# eolia-web-api

Eolia Unofficial Web API

## APIドキュメント

https://nana4rider.github.io/eolia-web-api/

## データベース構成の変更
```
npm run typeorm:generate-migration ./src/migration/[name]
npm run typeorm:run-migrations
```

## Home Assistantの設定例(MQTT)
```yaml
mqtt:
  climate:
    - name: 'エアコン'
      qos: 1
      min_temp: 16
      max_temp: 30
      temp_step: 0.5
      modes: ["auto", "off", "cool", "heat", "dry", "fan_only"]
      preset_modes: ["comfort", "eco", "away", "cleaning"]
      current_temperature_topic: 'eolia-web-api/{deviceId}/current_temperature/get'
      mode_command_topic: 'eolia-web-api/{deviceId}/mode/set'
      mode_state_topic: 'eolia-web-api/{deviceId}/mode/get'
      preset_mode_command_topic: 'eolia-web-api/{deviceId}/preset_mode/set'
      preset_mode_state_topic: 'eolia-web-api/{deviceId}/preset_mode/get'
      temperature_command_topic: 'eolia-web-api/{deviceId}/temperature/set'
      temperature_state_topic: 'eolia-web-api/{deviceId}/temperature/get'
      fan_mode_command_topic: 'eolia-web-api/{deviceId}/fan_mode/set'
      fan_mode_state_topic: 'eolia-web-api/{deviceId}/fan_mode/get'
      fan_modes: ["auto", "1", "2", "3", "4", "powerful", "quiet", "long"]

  switch:
    - name: "エアコン_電源"
      qos: 1
      command_topic: "eolia-web-api/{deviceId}/power/set"
      state_topic: "eolia-web-api/{deviceId}/power/get"
      icon: mdi:hvac
    - name: "エアコン_ナノイーX"
      qos: 1
      options: ["on", "off"]
      command_topic: "eolia-web-api/{deviceId}/nanoex/set"
      state_topic: "eolia-web-api/{deviceId}/nanoex/get"
   
  select:
    - name: "エアコン_上下風向"
      qos: 1
      options: ["auto", "1", "2", "3", "4", "5"]
      command_topic: "eolia-web-api/{deviceId}/wind_direction/set"
      state_topic: "eolia-web-api/{deviceId}/wind_direction/get"
    - name: "エアコン_左右風向"
      qos: 1
      options: ["auto", "to_left", "nearby_left", "front", "nearby_right", "to_right"]
      command_topic: "eolia-web-api/{deviceId}/wind_direction_horizon/set"
      state_topic: "eolia-web-api/{deviceId}/wind_direction_horizon/get"
    - name: "エアコン_切タイマー"
      qos: 1
      options: ["off", "30min", "60min", "90min", "120min"]
      command_topic: "eolia-web-api/{deviceId}/off_timer/set"
      state_topic: "eolia-web-api/{deviceId}/off_timer/get"
```
