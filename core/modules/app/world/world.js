import { ResourceManager, ChunkManager, WorkerManager } from '../../managers'
import Config from '../../../config/config'
import Helpers from '../../../utils/helpers'
import Stateful from '../../../lib/stateful/stateful'
import { UPDATE_WORLD_MUTATION } from '../../../lib/graphql'

import createSky from './sky/sky'
import Chat from './chat/chat'

const LIQUID = Config.block.liquid

class World extends Stateful {
  constructor(worldData, scene, apolloClient, container, playerData) {
    super({ isSetup: false })

    const { id, name, seed, time, days, changedBlocks } = worldData

    this.data = {
      id,
      name,
      seed,
      time,
      days,
      y: playerData.y,
      playerId: playerData.id
    }

    this.scene = scene
    this.apolloClient = apolloClient

    this.chat = new Chat(this.data.playerId, id, container, apolloClient)

    this.resourceManager = new ResourceManager()
    this.workerManager = new WorkerManager(this)
    this.chunkManager = new ChunkManager(
      scene,
      seed,
      this.resourceManager,
      this.workerManager,
      changedBlocks
    )
  }

  init = () => {
    this.initPlayer()
    this.initUpdaters()
  }

  initPlayer = () => {
    if (Helpers.approxEquals(this.data.playerY, Number.MIN_SAFE_INTEGER, 5))
      this.workerManager.queueSpecificChunk({
        cmd: 'GET_HIGHEST',
        x: 0,
        z: 0
      })
    else this.setState({ isSetup: true })
  }

  initUpdaters = () => {
    this.envUpdater = window.requestInterval(this.updateEnv, 100)
    this.timeUpdater = window.requestInterval(() => {
      const t = this.sky.getTime()
      if (t) {
        this.apolloClient.mutate({
          mutation: UPDATE_WORLD_MUTATION,
          variables: {
            id: this.data.id,
            time: t
          }
        })
      }
    }, 500)

    this.sky.on('new-day', () => {
      const days = this.sky.getDays()
      if (days) {
        this.data.days = days
        this.apolloClient.mutate({
          mutation: UPDATE_WORLD_MUTATION,
          variables: {
            id: this.data.id,
            days
          }
        })
      }
    })
  }

  update = () => {
    this.workerManager.update()
    this.chunkManager.update()
    this.sky.tick()
  }

  updateEnv = () => {
    if (!this.state.isSetup) return

    const playerPos = this.player.getCoordinates()
    const { coordx, coordy, coordz } = Helpers.globalBlockToChunkCoords(playerPos)
    this.chunkManager.surroundingChunksCheck(coordx, coordy, coordz)
  }

  removeUpdaters = () => {
    window.clearRequestInterval(this.envUpdater)
    window.clearRequestInterval(this.timeUpdater)
  }

  /* -------------------------------------------------------------------------- */
  /*                                   SETTERS                                  */
  /* -------------------------------------------------------------------------- */
  setPlayer = player => {
    this.player = player
    this.sky = createSky(this.scene, this, {
      speed: 0.1
    })(this.data.time, this.data.days)
  }

  setTarget = target => (this.targetBlock = target)

  setPotential = potential => (this.potentialBlock = potential)

  /* -------------------------------------------------------------------------- */
  /*                                   GETTERS                                  */
  /* -------------------------------------------------------------------------- */
  getPlayer = () => this.player

  getChat = () => this.chat

  getDays = () => this.data.days

  getVoxelByVoxelCoords = (x, y, z) => {
    /** RETURN INFORMATION ABOUT CHUNKS */
    const type = this.chunkManager.getTypeAt(x, y, z)
    return type
  }

  getVoxelByWorldCoords = (x, y, z) => {
    const gbc = Helpers.worldToBlock({ x, y, z })
    return this.getVoxelByVoxelCoords(gbc.x, gbc.y, gbc.z)
  }

  getSolidityByVoxelCoords = (x, y, z, forPassing = false) => {
    const type = this.getVoxelByVoxelCoords(x, y, z)
    if (typeof type !== 'number') return forPassing

    const isSolid = LIQUID.includes(type)
    return !isSolid
  }

  getSolidityByWorldCoords = (x, y, z) => {
    const gbc = Helpers.worldToBlock({ x, y, z })
    return this.getSolidityByVoxelCoords(gbc.x, gbc.y, gbc.z)
  }

  getPassableByVoxelCoords = (x, y, z) => this.getSolidityByVoxelCoords(x, y, z, true)

  getTargetBlockType = () => {
    if (!this.targetBlock) return 0

    const {
      chunk: { cx, cy, cz },
      block: { x, y, z }
    } = this.targetBlock
    const bCoords = Helpers.chunkBlockToGlobalBlock({
      x,
      y,
      z,
      coordx: cx,
      coordy: cy,
      coordz: cz
    })

    return this.getVoxelByVoxelCoords(bCoords.x, bCoords.y, bCoords.z)
  }

  getIsReady = () => this.chunkManager.isReady
}

export default World
